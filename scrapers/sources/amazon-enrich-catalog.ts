/**
 * Build a high-confidence demo catalog using Amazon PA-API as metadata enrichment only.
 * - Amazon PDP listings (primary)
 * - Optional multi-retailer rows with Amazon image/title + retailer search URLs
 */
import { buildRetailerSearchUrl } from "../../src/lib/affiliate";
import { enrichCandidate } from "../../src/lib/demo-commerce/amazon-enrichment/enrich";
import type { EnrichCandidateInput } from "../../src/lib/demo-commerce/amazon-enrichment/types";
import { buildDisplayTitle, normalizeEnrichmentTitle } from "../../src/lib/demo-commerce/amazon-enrichment/normalize";
import { getEnrichmentCacheStats } from "../../src/lib/demo-commerce/amazon-enrichment/cache";
import { isAmazonEnrichmentAvailable } from "../../src/lib/demo-commerce/amazon-enrichment/enrich";
import { normalizeCategory, retailerAllowsCategory } from "../../src/lib/demo-commerce/taxonomy";
import { passesQualityThreshold, scoreProductQuality } from "../../src/lib/demo-commerce/quality";
import { CATALOG } from "../../src/lib/retailers/catalog";
import type { RetailerId } from "../../src/lib/types";
import type { DemoProduct } from "../base/types";
import { ADAPTER_RETAILERS, BULK_SEARCH_QUERIES, PRIORITY_RETAILERS } from "../config";
import { getDomainForRetailer } from "../utils/retailer-domains";
import { makeProductId } from "../utils/storage";

export interface AmazonEnrichCatalogOptions {
  cacheOnly?: boolean;
  maxCatalogItems?: number;
  maxExtraQueries?: number;
  retailersPerItem?: number;
  includeRetailerExpansion?: boolean;
  throttleMs?: number;
}

export interface AmazonEnrichCatalogReport {
  candidates: number;
  enriched: number;
  productsBuilt: number;
  published: number;
  cacheStats: ReturnType<typeof getEnrichmentCacheStats>;
  paapiConfigured: boolean;
}

type CatalogCandidate = EnrichCandidateInput & { size?: string };

function catalogItemToCandidate(item: (typeof CATALOG)[0]): CatalogCandidate {
  return {
    id: item.id,
    title: item.title,
    brand: item.brand,
    category: item.category,
    basePrice: item.basePrice,
    size: item.size,
  };
}

function buildAmazonProduct(
  enrichment: NonNullable<Awaited<ReturnType<typeof enrichCandidate>>>,
  candidate: CatalogCandidate,
): DemoProduct | null {
  if (!enrichment.pdpUrl || !enrichment.imageUrl || !enrichment.amazonTitle) return null;

  const displayTitle = buildDisplayTitle(
    { title: candidate.title, brand: candidate.brand, size: candidate.size },
    enrichment.amazonTitle,
  );
  const { category } = normalizeCategory(
    displayTitle,
    enrichment.categoryHint ?? candidate.category,
    "amazon",
  );

  const p: DemoProduct = {
    id: makeProductId("amazon", enrichment.pdpUrl),
    retailer: "amazon",
    retailer_domain: "amazon.com",
    title: displayTitle,
    brand: candidate.brand ?? null,
    category,
    price: enrichment.price ?? candidate.basePrice ?? null,
    currency: "USD",
    image_url: enrichment.imageUrl,
    product_url: enrichment.pdpUrl,
    availability: "in_stock",
    description: null,
    scraped_at: new Date().toISOString(),
    link_valid: true,
    image_valid: true,
  };

  const s = scoreProductQuality(p);
  return {
    ...p,
    quality_score: s.overall,
    normalized_category: s.normalizedCategory,
    link_type: s.linkType,
  };
}

function buildRetailerProduct(
  retailer: RetailerId,
  enrichment: NonNullable<Awaited<ReturnType<typeof enrichCandidate>>>,
  candidate: CatalogCandidate,
): DemoProduct | null {
  const domain = getDomainForRetailer(retailer);
  if (!domain || !enrichment.imageUrl || !enrichment.amazonTitle) return null;

  const searchQuery = normalizeEnrichmentTitle(candidate.title, candidate.brand);
  const displayTitle = buildDisplayTitle(
    { title: candidate.title, brand: candidate.brand, size: candidate.size },
    enrichment.amazonTitle,
  );
  const { category } = normalizeCategory(
    displayTitle,
    enrichment.categoryHint ?? candidate.category,
    retailer,
  );

  if (!retailerAllowsCategory(retailer, category)) return null;

  const productUrl = buildRetailerSearchUrl(retailer, searchQuery);
  const price =
    enrichment.price != null ?
      Math.round(enrichment.price * (0.97 + (retailer.length % 5) * 0.01) * 100) / 100
    : candidate.basePrice ?? null;

  const p: DemoProduct = {
    id: makeProductId(retailer, `${candidate.id}-${productUrl}`),
    retailer,
    retailer_domain: domain,
    title: displayTitle,
    brand: candidate.brand ?? null,
    category,
    price,
    currency: "USD",
    image_url: enrichment.imageUrl,
    product_url: productUrl,
    availability: "in_stock",
    description: null,
    scraped_at: new Date().toISOString(),
    link_valid: true,
    image_valid: true,
  };

  const s = scoreProductQuality(p);
  return {
    ...p,
    quality_score: s.overall,
    normalized_category: s.normalizedCategory,
    link_type: s.linkType,
  };
}

export async function buildAmazonEnrichedCatalog(
  opts: AmazonEnrichCatalogOptions = {},
): Promise<{ products: DemoProduct[]; report: AmazonEnrichCatalogReport }> {
  const paapiConfigured = isAmazonEnrichmentAvailable();
  if (!paapiConfigured && !opts.cacheOnly) {
    console.warn(
      "[amazon-enrich] PA-API not configured — set AMAZON_PA_API_* or run with --cache-only",
    );
  }

  const catalogSlice = CATALOG.slice(0, opts.maxCatalogItems ?? CATALOG.length);
  const extraQueries: CatalogCandidate[] = BULK_SEARCH_QUERIES.slice(
    0,
    opts.maxExtraQueries ?? 40,
  ).map((q, i) => ({
    id: `query-${i}-${q.replace(/\s+/g, "-")}`,
    title: q,
  }));

  const candidates: CatalogCandidate[] = [
    ...catalogSlice.map(catalogItemToCandidate),
    ...extraQueries,
  ];
  const products: DemoProduct[] = [];
  const seen = new Set<string>();
  let enriched = 0;

  const retailerPool: RetailerId[] =
    opts.includeRetailerExpansion !== false ?
      ([...new Set([...ADAPTER_RETAILERS, ...PRIORITY_RETAILERS])] as RetailerId[])
    : [];
  const maxRetailersPerItem = opts.retailersPerItem ?? 8;

  for (const candidate of candidates) {
    const enrichment = await enrichCandidate(candidate, {
      cacheOnly: opts.cacheOnly,
      throttleMs: opts.throttleMs,
    });
    if (!enrichment) continue;
    enriched++;

    const amazonRow = buildAmazonProduct(enrichment, candidate);
    if (amazonRow && passesQualityThreshold(amazonRow)) {
      const key = amazonRow.product_url.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        products.push(amazonRow);
      }
    }

    if (retailerPool.length) {
      let added = 0;
      for (const retailer of retailerPool) {
        if (retailer === "amazon") continue;
        if (added >= maxRetailersPerItem) break;
        const row = buildRetailerProduct(retailer, enrichment, candidate);
        if (!row || !passesQualityThreshold(row)) continue;
        const key = row.id;
        if (seen.has(key)) continue;
        seen.add(key);
        products.push(row);
        added++;
      }
    }
  }

  const report: AmazonEnrichCatalogReport = {
    candidates: candidates.length,
    enriched,
    productsBuilt: products.length,
    published: products.length,
    cacheStats: getEnrichmentCacheStats(),
    paapiConfigured,
  };

  console.log(
    `[amazon-enrich] ${report.enriched}/${report.candidates} enriched → ${report.published} published`,
  );

  return { products, report };
}
