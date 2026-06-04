import type { DemoProduct, IngestOptions, IngestReport, ScrapeContext } from "../base/types";
import { DEFAULT_INGEST, DEFAULT_USER_AGENT, PRIORITY_RETAILERS } from "../config";
import { filterPreValidation } from "../utils/quality";
import { validateAndFilterCatalog } from "../utils/validate";
import { getScraperForRetailer } from "../retailers";
import { listUniqueRetailers } from "../utils/retailer-domains";
import {
  dedupeProducts,
  loadProducts,
  mergeIncremental,
  saveProducts,
} from "../utils/storage";

export async function runIngest(opts: IngestOptions = {}): Promise<IngestReport> {
  const startedAt = new Date().toISOString();
  const maxPerRetailer = opts.maxPerRetailer ?? DEFAULT_INGEST.maxPerRetailer;
  const concurrency = opts.concurrency ?? DEFAULT_INGEST.concurrency;
  const discoverLimit = opts.discoverLimit ?? DEFAULT_INGEST.discoverLimit;
  const validateLinks = opts.validateLinks ?? DEFAULT_INGEST.validateLinks;
  const incremental = opts.incremental ?? DEFAULT_INGEST.incremental;
  const chunkSize = opts.chunkSize ?? DEFAULT_INGEST.chunkSize;

  const retailerFilter = opts.retailers?.length
    ? opts.retailers
    : [...PRIORITY_RETAILERS];

  const allRetailers = listUniqueRetailers();
  const targets = allRetailers.filter((r) => retailerFilter.includes(r.retailer));

  const collected: DemoProduct[] = [];
  const errors: string[] = [];
  const skippedRetailers: string[] = [];
  const byRetailer: Record<string, number> = {};

  for (const { retailer, domain } of targets) {
    const scraper = getScraperForRetailer(retailer);
    if (!scraper) {
      skippedRetailers.push(retailer);
      continue;
    }

    const ctx: ScrapeContext = {
      retailer,
      retailer_domain: domain,
      rateLimitRps: 1,
      timeoutMs: 25_000,
      maxRetries: 2,
      userAgent: DEFAULT_USER_AGENT,
    };

    console.log(`[ingest] ${retailer} (${domain}) — discovering up to ${discoverLimit} URLs…`);

    let urls: string[] = [];
    try {
      urls = await scraper.discoverProductUrls(ctx, discoverLimit);
    } catch (e) {
      errors.push(`${retailer}:discover:${String(e)}`);
      skippedRetailers.push(retailer);
      continue;
    }

    urls = urls.slice(0, maxPerRetailer);
    if (!urls.length) {
      errors.push(`${retailer}:no_urls`);
      skippedRetailers.push(retailer);
      continue;
    }

    console.log(`[ingest] ${retailer} — scraping ${urls.length} URLs (concurrency ${concurrency})…`);

    try {
      const result = await scraper.scrapeProductUrls(ctx, urls);
      collected.push(...result.products);
      byRetailer[retailer] = result.products.length;
      errors.push(...result.errors.slice(0, 20).map((e) => `${retailer}:${e}`));
      console.log(
        `[ingest] ${retailer} — ${result.products.length}/${result.urlsAttempted} products`,
      );
    } catch (e) {
      errors.push(`${retailer}:scrape:${String(e)}`);
      skippedRetailers.push(retailer);
    }
  }

  let merged = filterPreValidation(dedupeProducts(collected));
  if (incremental) {
    merged = filterPreValidation(mergeIncremental(loadProducts(), merged));
  }

  if (validateLinks && merged.length) {
    console.log(`[ingest] validating ${merged.length} product links…`);
    const { kept, rejected } = await validateAndFilterCatalog(merged, {
      concurrency: 6,
      userAgent: DEFAULT_USER_AGENT,
    });
    console.log(`[ingest] validation rejected ${rejected}, kept ${kept.length}`);
    merged = kept;
  }

  saveProducts(merged, { chunkSize, writeMonolith: true });

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    totalProducts: merged.length,
    byRetailer,
    errors: errors.slice(0, 100),
    skippedRetailers,
  };
}
