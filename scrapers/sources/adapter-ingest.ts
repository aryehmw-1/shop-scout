/**
 * Real products via existing retailer search adapters (Walmart, Target, etc.).
 * Highest-yield path for a populated catalog without custom per-site scrapers.
 */
import { buildRetailerSearchUrl } from "../../src/lib/affiliate";
import { CATALOG } from "../../src/lib/retailers/catalog";
import { fetchRetailerHtmlWithRetries } from "../../src/lib/offers/retailer-adapters/retailer-fetch";
import { getRetailerAdapter } from "../../src/lib/offers/retailer-adapters";
import type { RetailerId } from "../../src/lib/types";
import type { DemoProduct } from "../base/types";
import { ADAPTER_RETAILERS, BULK_SEARCH_QUERIES } from "../config";
import { getDomainForRetailer } from "../utils/retailer-domains";
import { mapWithConcurrency } from "../utils/queue";
import { makeProductId, dedupeProducts } from "../utils/storage";
import { filterPreValidation } from "../utils/quality";
import { extractManySearchHits } from "../utils/search-multi";

export interface AdapterIngestOptions {
  maxQueries?: number;
  concurrency?: number;
  retailers?: string[];
}

export interface AdapterIngestStats {
  tasks: number;
  succeeded: number;
  failed: number;
  byRetailer: Record<string, number>;
}

export async function ingestFromAdapters(
  opts: AdapterIngestOptions = {},
): Promise<{ products: DemoProduct[]; stats: AdapterIngestStats }> {
  const adapterSet = new Set<string>(ADAPTER_RETAILERS);
  const retailers = opts.retailers?.length
    ? opts.retailers.filter((r) => adapterSet.has(r))
    : [...ADAPTER_RETAILERS];

  const queries = new Set<string>();
  for (const item of CATALOG) {
    queries.add(item.title);
    if (item.brand && !/^generic$/i.test(item.brand)) {
      queries.add(`${item.brand} ${item.title}`.slice(0, 100));
    }
  }
  for (const q of BULK_SEARCH_QUERIES) queries.add(q);

  const queryList = [...queries].slice(0, opts.maxQueries ?? 200);
  const tasks: { retailer: string; query: string }[] = [];
  for (const retailer of retailers) {
    for (const query of queryList) {
      tasks.push({ retailer, query });
    }
  }

  const products: DemoProduct[] = [];
  const byRetailer: Record<string, number> = {};
  let succeeded = 0;
  let failed = 0;

  console.log(
    `[adapter-ingest] ${tasks.length} search tasks (${retailers.length} retailers × ${queryList.length} queries)`,
  );

  await mapWithConcurrency(
    tasks,
    opts.concurrency ?? 4,
    async ({ retailer, query }) => {
      const adapter = getRetailerAdapter(retailer as RetailerId);
      const domain = getDomainForRetailer(retailer);
      if (!adapter || !domain) {
        failed++;
        return;
      }

      const searchUrl = buildRetailerSearchUrl(retailer as RetailerId, query);
      try {
        const row = await fetchRetailerHtmlWithRetries(searchUrl, retailer as RetailerId);
        if (!row?.html) {
          failed++;
          return;
        }
        const hits = extractManySearchHits(row.html, row.resolvedUrl ?? searchUrl, retailer);
        let added = 0;
        for (const hit of hits) {
          if (!hit?.pdpUrl || !hit.imageUrl || !hit.priceUsd || !hit.storeTitle) continue;
          if (!hit.pdpUrl.includes(domain.replace(/^www\./, ""))) continue;
          products.push({
            id: makeProductId(retailer, hit.pdpUrl),
            retailer,
            retailer_domain: domain,
            title: hit.storeTitle.slice(0, 300),
            brand: null,
            category: null,
            price: hit.priceUsd,
            currency: "USD",
            image_url: hit.imageUrl,
            product_url: hit.pdpUrl,
            availability: "in_stock",
            description: null,
            scraped_at: new Date().toISOString(),
          });
          added++;
        }
        if (!added) {
          failed++;
          return;
        }
        succeeded += added;
        byRetailer[retailer] = (byRetailer[retailer] ?? 0) + added;
      } catch {
        failed++;
      }
    },
    { retries: 1, retryDelayMs: 600 },
  );

  const filtered = filterPreValidation(dedupeProducts(products));
  return {
    products: filtered,
    stats: { tasks: tasks.length, succeeded, failed, byRetailer },
  };
}
