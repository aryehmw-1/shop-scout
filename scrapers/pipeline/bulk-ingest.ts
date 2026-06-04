import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DemoProduct, IngestReport } from "../base/types";
import { DEFAULT_USER_AGENT, PRIORITY_RETAILERS } from "../config";
import { runIngest } from "./ingest";
import { ingestFromAdapters } from "../sources/adapter-ingest";
import { ingestFromAmazonPaapi } from "../sources/amazon-paapi-ingest";
import { buildAmazonEnrichedCatalog } from "../sources/amazon-enrich-catalog";
import { buildCatalogMatrix } from "../sources/catalog-matrix";
import { ingestFromPrisma } from "../sources/prisma-ingest";
import {
  dedupeProducts,
  loadProducts,
  mergeIncremental,
  saveProducts,
} from "../utils/storage";
import { filterCatalogQuality, filterPreValidation } from "../utils/quality";
import { validateAndFilterCatalog } from "../utils/validate";

export interface BulkIngestOptions {
  skipAdapters?: boolean;
  skipScrape?: boolean;
  skipAmazonPaapi?: boolean;
  skipCatalogMatrix?: boolean;
  withPrisma?: boolean;
  maxPerRetailer?: number;
  maxAdapterQueries?: number;
  maxPaapiQueries?: number;
  validate?: boolean;
}

export interface RetailerScore {
  retailer: string;
  collected: number;
  published: number;
  compatibilityScore: number;
}

export interface BulkIngestReport extends IngestReport {
  adapterStats?: Awaited<ReturnType<typeof ingestFromAdapters>>["stats"];
  preValidationCount: number;
  postValidationCount: number;
  rejectedValidation: number;
  retailerScores: RetailerScore[];
}

export async function runBulkIngest(opts: BulkIngestOptions = {}): Promise<BulkIngestReport> {
  const startedAt = new Date().toISOString();
  let collected: DemoProduct[] = [];
  const errors: string[] = [];
  const skippedRetailers: string[] = [];
  const byRetailer: Record<string, number> = {};

  if (opts.withPrisma) {
    try {
      console.log("[bulk] importing from Prisma PriceQuote…");
      const fromDb = await ingestFromPrisma();
      collected.push(...fromDb);
      console.log(`[bulk] prisma: ${fromDb.length} rows`);
    } catch (e) {
      errors.push(`prisma:${String(e)}`);
    }
  }

  if (!opts.skipAmazonPaapi) {
    const { products: enriched, report } = await buildAmazonEnrichedCatalog({
      maxExtraQueries: opts.maxPaapiQueries ?? 50,
      retailersPerItem: 8,
    });
    collected.push(...enriched);
    byRetailer.amazon = (byRetailer.amazon ?? 0) + enriched.filter((p) => p.retailer === "amazon").length;
    console.log(
      `[bulk] amazon enrichment: ${report.enriched}/${report.candidates} → ${report.published} listings`,
    );
    if (!report.paapiConfigured && enriched.length === 0) {
      const legacy = await ingestFromAmazonPaapi({
        maxQueries: opts.maxPaapiQueries ?? 120,
        itemsPerQuery: 10,
      });
      collected.push(...legacy);
      byRetailer.amazon = (byRetailer.amazon ?? 0) + legacy.length;
    }
  }

  if (!opts.skipAdapters) {
    const { products, stats } = await ingestFromAdapters({
      maxQueries: opts.maxAdapterQueries ?? 180,
      concurrency: 5,
    });
    collected.push(...products);
    errors.push(`adapter:tasks=${stats.tasks},ok=${stats.succeeded},fail=${stats.failed}`);
    for (const [r, n] of Object.entries(stats.byRetailer)) {
      byRetailer[r] = (byRetailer[r] ?? 0) + n;
    }
  }

  const useMatrix = opts.skipCatalogMatrix === false;
  if (useMatrix) {
    const matrix = buildCatalogMatrix();
    collected.push(...matrix);
    console.log(`[bulk] catalog matrix: ${matrix.length} listings`);
    for (const p of matrix) {
      byRetailer[p.retailer] = (byRetailer[p.retailer] ?? 0) + 1;
    }
  }

  saveProducts(dedupeProducts(collected), { chunkSize: 250, writeMonolith: true });

  if (!opts.skipScrape) {
    const scrapeReport = await runIngest({
      retailers: [...PRIORITY_RETAILERS],
      maxPerRetailer: opts.maxPerRetailer ?? 80,
      concurrency: 4,
      discoverLimit: 200,
      validateLinks: false,
      incremental: true,
      chunkSize: 250,
    });
    collected = loadProducts();
    errors.push(...scrapeReport.errors.slice(0, 30));
    for (const [r, n] of Object.entries(scrapeReport.byRetailer)) {
      byRetailer[r] = (byRetailer[r] ?? 0) + n;
    }
    skippedRetailers.push(...scrapeReport.skippedRetailers);
  } else {
    collected = dedupeProducts(collected);
  }

  const preValidationCount = dedupeProducts(collected).length;
  let working = filterPreValidation(dedupeProducts(collected));

  let rejectedValidation = 0;
  if (opts.validate !== false && working.length <= 800) {
    console.log(`[bulk] deep-validating ${working.length} candidates…`);
    const { kept, rejected } = await validateAndFilterCatalog(working, {
      concurrency: 8,
      userAgent: DEFAULT_USER_AGENT,
    });
    rejectedValidation = rejected;
    working = kept;
  } else if (working.length > 800) {
    console.log(`[bulk] skip deep validation (${working.length} rows) — run demo:validate`);
    working = working.map((p) => ({
      ...p,
      link_valid: true,
      image_valid: Boolean(p.image_url?.startsWith("http")),
    }));
  }

  const published = filterCatalogQuality(working);
  saveProducts(published, { chunkSize: 250, writeMonolith: true });

  const retailerScores = buildRetailerScores(published, byRetailer);

  const report: BulkIngestReport = {
    startedAt,
    completedAt: new Date().toISOString(),
    totalProducts: published.length,
    byRetailer,
    errors,
    skippedRetailers: [...new Set(skippedRetailers)],
    preValidationCount,
    postValidationCount: working.length,
    rejectedValidation,
    retailerScores,
  };

  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(join(process.cwd(), "data", "ingest-report.json"), JSON.stringify(report, null, 2));

  return report;
}

function buildRetailerScores(
  published: DemoProduct[],
  collected: Record<string, number>,
): RetailerScore[] {
  const publishedBy = new Map<string, number>();
  for (const p of published) {
    publishedBy.set(p.retailer, (publishedBy.get(p.retailer) ?? 0) + 1);
  }

  const retailers = new Set([...Object.keys(collected), ...publishedBy.keys()]);
  return [...retailers].map((retailer) => {
    const c = collected[retailer] ?? 0;
    const p = publishedBy.get(retailer) ?? 0;
    const compatibilityScore = c > 0 ? Math.round((p / c) * 1000) / 1000 : 0;
    return { retailer, collected: c, published: p, compatibilityScore };
  }).sort((a, b) => b.compatibilityScore - a.compatibilityScore);
}
