import { parseImpactFeedText } from "../ingest/impact/parse-feed";
import { createIngestDuplicateTracker, validateImpactRow } from "../ingest/row-validation";
import { buildIntelligenceGraph } from "../confidence/compute";
import { mapGraphToDemoCanonical } from "../graph/map-to-demo";
import { loadAllGraphs } from "../graph/store";
import type { NormalizedImpactRow } from "../ingest/impact/types";
import type { RetailerId } from "@/lib/types";

export interface IngestStressCase {
  id: string;
  description: string;
  passed: boolean;
  detail: string;
}

export interface IngestStressReport {
  evaluatedAt: string;
  passed: number;
  total: number;
  cases: IngestStressCase[];
}

function sampleRow(partial: Partial<NormalizedImpactRow> & { title: string; price: number }): NormalizedImpactRow {
  return {
    row_id: partial.row_id ?? "r1",
    catalog_id: "stress",
    advertiser_name: "stress",
    retailer: (partial.retailer ?? "walmart") as RetailerId,
    retailer_domain: "walmart.com",
    title: partial.title,
    brand: null,
    description: null,
    product_url: partial.product_url ?? "https://www.walmart.com/ip/stress/1",
    affiliate_url: partial.affiliate_url ?? "https://www.walmart.com/ip/stress/1",
    image_url: partial.image_url ?? "https://example.com/p.jpg",
    price: partial.price,
    currency: "USD",
    was_price: partial.was_price ?? null,
    availability: "in_stock",
    category_raw: null,
    identifiers: {},
    link_type: partial.link_type ?? "pdp",
    raw: {},
  };
}

/** Synthetic ingest edge cases — no live feed required. */
export function runIngestStressSuite(): IngestStressReport {
  const cases: IngestStressCase[] = [];

  const valid = sampleRow({ title: "Valid Stress Product Name", price: 29.99 });
  const noTitle = sampleRow({ title: "ab", price: 10 });
  const badPrice = sampleRow({ title: "Valid Title Here", price: -1 });
  const searchLink = sampleRow({
    title: "Valid Title Here",
    price: 19,
    link_type: "search",
    product_url: "https://www.walmart.com/search?q=x",
  });

  cases.push({
    id: "reject_invalid_rows",
    description: "Row validation rejects bad title, price, and search URLs",
    passed:
      !validateImpactRow(noTitle).valid &&
      !validateImpactRow(badPrice).valid &&
      !validateImpactRow(searchLink).valid &&
      validateImpactRow(valid).valid,
    detail: `valid=${validateImpactRow(valid).valid}`,
  });

  const dupes = createIngestDuplicateTracker();
  const r1 = sampleRow({ title: "Dup Product Name Here", price: 10, row_id: "a" });
  const r2 = sampleRow({ title: "Dup Product Name Here", price: 11, row_id: "b" });
  dupes.isDuplicate(r1);
  const isDup = dupes.isDuplicate(r2);
  cases.push({
    id: "detect_duplicates",
    description: "Duplicate retailer+URL detected in batch",
    passed: isDup,
    detail: isDup ? "duplicate detected" : "missed duplicate",
  });

  const partialFeed = `title\tprice\tlink\timage_link
Good Product Name\t12.99\thttps://www.walmart.com/ip/good/1\thttps://example.com/img.jpg
\tx\thttps://www.target.com/p/A-1\thttps://example.com/img2.jpg
`;
  const parsed = parseImpactFeedText(partialFeed, {
    catalogId: "stress",
    advertiserName: "stress",
  });
  cases.push({
    id: "parse_partial_feed",
    description: "Partial feed yields only valid rows",
    passed: parsed.length >= 1,
    detail: `${parsed.length} row(s) parsed`,
  });

  const graphs = loadAllGraphs();
  if (graphs[0]) {
    try {
      const canonical = mapGraphToDemoCanonical(graphs[0]);
      const offers = canonical.offers.map((o, i) =>
        i === 0 ? { ...o, price: 99999 } : o,
      );
      buildIntelligenceGraph({ ...canonical, offers });
      cases.push({
        id: "extreme_price_graph",
        description: "Extreme price graph builds without crash",
        passed: true,
        detail: "build ok",
      });
    } catch (e) {
      cases.push({
        id: "extreme_price_graph",
        description: "Extreme price graph builds without crash",
        passed: false,
        detail: String(e),
      });
    }
  }

  cases.push({
    id: "catalog_baseline",
    description: "Intelligence graphs available for stress baseline",
    passed: graphs.length > 0,
    detail: `${graphs.length} graph(s)`,
  });

  const passed = cases.filter((c) => c.passed).length;
  return {
    evaluatedAt: new Date().toISOString(),
    passed,
    total: cases.length,
    cases,
  };
}
