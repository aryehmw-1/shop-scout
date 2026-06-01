/**
 * Platform-wide data observability — counts, ingestion rates, artifact retention.
 */
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db/prisma";
import { isAmazonPaapiConfigured } from "../search/providers/amazon-paapi-config";
import { DATA_LOSS_CAUSES } from "./persistence-guard";
import { summarizeOrchestrationMetrics } from "../retailers/acquisition/orchestration-metrics";
import { listCachedPaths } from "../retailers/acquisition/path-cache";
import {
  buildQuoteRefreshBacklog,
  countQuotesByFreshnessTier,
} from "../indexing/quote-refresh-scheduler";
import { loadLastIndexRunArtifact } from "../indexing/index-run-artifact";
import {
  consumerVisibleQuoteCutoff,
  freshnessHistogramBucket,
  listRetailerFreshnessPolicies,
} from "../pricing/quote-freshness-policy";

const ARTIFACT_ROOTS = [
  join(process.cwd(), "artifacts", "experiments"),
  join(process.cwd(), "artifacts", "ops"),
  join(process.cwd(), "artifacts", "extraction"),
];

async function countFilesRecursive(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;
  let count = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) count += await countFilesRecursive(p);
    else count += 1;
  }
  return count;
}

async function artifactRetentionSummary() {
  const rows: Array<{ path: string; exists: boolean; fileCount: number; bytes?: number }> = [];
  for (const root of ARTIFACT_ROOTS) {
    const exists = existsSync(root);
    let fileCount = 0;
    let bytes = 0;
    if (exists) {
      fileCount = await countFilesRecursive(root);
      try {
        const s = await stat(root);
        bytes = s.size;
      } catch {
        /* ignore */
      }
    }
    rows.push({ path: root.replace(process.cwd(), "."), exists, fileCount, bytes });
  }
  return rows;
}

export interface PlatformHealthSnapshot {
  generatedAt: string;
  database: {
    products: number;
    priceQuotes: number;
    activeQuotes: number;
    expiredQuotes: number;
    searchSessions: number;
    experimentBatches: number;
  };
  quotesBySource: Array<{ source: string; count: number; active: number }>;
  quotesByRetailer: Array<{ retailerId: string; count: number; active: number }>;
  ingestion: {
    amazonPaapiConfigured: boolean;
    affiliateTagsConfigured: string[];
  };
  artifacts: Awaited<ReturnType<typeof artifactRetentionSummary>>;
  orchestration: Awaited<ReturnType<typeof summarizeOrchestrationMetrics>>;
  cachedAcquisitionPaths: Awaited<ReturnType<typeof listCachedPaths>>;
  dataLossRiskFactors: typeof DATA_LOSS_CAUSES;
  persistenceNotes: string[];
  acquisition?: {
    lastRunAt?: string;
    fetchSuccessRate: number;
    parseSuccessRate: number;
    verifiedPersistenceRate: number;
    trustRejectionRate: number;
    failureClasses: Record<string, number>;
    persistRejectionsByReason: Record<string, number>;
    productsIndexed: number;
    offersWritten: number;
    amazonPaapi: boolean;
    bottleneck?: string;
  };
  freshness: {
    distribution: Record<string, number>;
    ageHistogram: Record<string, number>;
    visibleQuotes: number;
    staleVisibleCount: number;
    refreshBacklog: number;
    retailerPolicies: ReturnType<typeof listRetailerFreshnessPolicies>;
    emptyCatalogRisk: boolean;
    frontendEmptyStateWarning?: string;
  };
}

export async function collectPlatformHealth(): Promise<PlatformHealthSnapshot> {
  const now = new Date();
  const [products, priceQuotes, activeQuotes, expiredQuotes, searchSessions] =
    await Promise.all([
      prisma.product.count(),
      prisma.priceQuote.count(),
      prisma.priceQuote.count({ where: { expiresAt: { gt: now } } }),
      prisma.priceQuote.count({ where: { expiresAt: { lte: now } } }),
      prisma.searchSession.count(),
    ]);

  const bySourceRaw = await prisma.priceQuote.groupBy({
    by: ["source"],
    _count: { _all: true },
  });
  const byRetailerRaw = await prisma.priceQuote.groupBy({
    by: ["retailerId"],
    _count: { _all: true },
  });

  const activeBySource = await prisma.priceQuote.groupBy({
    by: ["source"],
    where: { expiresAt: { gt: now } },
    _count: { _all: true },
  });
  const activeSourceMap = new Map(activeBySource.map((r) => [r.source, r._count._all]));

  const activeByRetailer = await prisma.priceQuote.groupBy({
    by: ["retailerId"],
    where: { expiresAt: { gt: now } },
    _count: { _all: true },
  });
  const activeRetailerMap = new Map(
    activeByRetailer.map((r) => [r.retailerId, r._count._all]),
  );

  const affiliateTagsConfigured = [
    "AFFILIATE_AMAZON_TAG",
    "AFFILIATE_TARGET_TAG",
    "AFFILIATE_WALMART_TAG",
  ].filter((k) => Boolean(process.env[k]?.trim()));

  let experimentBatches = 0;
  const expRoot = join(process.cwd(), "artifacts", "experiments");
  if (existsSync(expRoot)) {
    const dirs = await readdir(expRoot, { withFileTypes: true });
    experimentBatches = dirs.filter((d) => d.isDirectory()).length;
  }

  const [artifacts, orchestration, cachedAcquisitionPaths, freshnessDistribution, refreshBacklog, lastIndexRun] =
    await Promise.all([
    artifactRetentionSummary(),
    summarizeOrchestrationMetrics(),
    listCachedPaths(),
    countQuotesByFreshnessTier(),
    buildQuoteRefreshBacklog(50),
    loadLastIndexRunArtifact(),
  ]);

  const visibleCutoff = consumerVisibleQuoteCutoff();
  const visibleQuotes = await prisma.priceQuote.count({
    where: { fetchedAt: { gte: visibleCutoff } },
  });

  const verifiedRows = await prisma.priceQuote.findMany({
    where: {
      source: { in: ["scraped", "connector_api", "daily_index", "nightly_index"] },
      fetchedAt: { gte: visibleCutoff },
    },
    select: { fetchedAt: true },
  });
  const ageHistogram: Record<string, number> = {
    "0-6h": 0,
    "6-24h": 0,
    "1-3d": 0,
    "3-7d": 0,
    "7d+": 0,
  };
  for (const row of verifiedRows) {
    const bucket = freshnessHistogramBucket(Date.now() - row.fetchedAt.getTime());
    ageHistogram[bucket] += 1;
  }

  const staleVisibleCount =
    (freshnessDistribution.stale_visible ?? 0) + (freshnessDistribution.expired ?? 0);

  const emptyCatalogRisk = products > 0 && visibleQuotes === 0;
  const frontendEmptyStateWarning =
    emptyCatalogRisk
      ? "Products exist in DB but zero consumer-visible quotes — run index refresh."
    : visibleQuotes > 0 && staleVisibleCount / visibleQuotes > 0.7
      ? "Most visible quotes are stale — proactive refresh recommended."
    : undefined;

  const persistenceNotes: string[] = [];
  if (activeQuotes === 0 && visibleQuotes > 0) {
    persistenceNotes.push(
      `${visibleQuotes} quotes visible via tiered freshness despite ${expiredQuotes} hard-expired rows.`,
    );
  }
  if (activeQuotes === 0 && products > 0 && visibleQuotes === 0) {
    persistenceNotes.push("Products exist but zero visible quotes — run index or check TTL/trust gates.");
  }
  if (expiredQuotes > activeQuotes * 2) {
    persistenceNotes.push("High expired-to-active quote ratio — schedule re-index.");
  }

  const persistRejectionsByReason: Record<string, number> = {};
  if (lastIndexRun?.retailerSummary.persistByRetailer) {
    for (const stats of Object.values(lastIndexRun.retailerSummary.persistByRetailer)) {
      for (const [reason, count] of Object.entries(stats.rejected)) {
        persistRejectionsByReason[reason] = (persistRejectionsByReason[reason] ?? 0) + count;
      }
    }
  }

  const acquisition =
    lastIndexRun ?
      {
        lastRunAt: lastIndexRun.generatedAt,
        fetchSuccessRate: lastIndexRun.retailerSummary.rates.fetchSuccessRate,
        parseSuccessRate: lastIndexRun.retailerSummary.rates.parseSuccessRate,
        verifiedPersistenceRate: lastIndexRun.retailerSummary.rates.verifiedPersistenceRate,
        trustRejectionRate: lastIndexRun.retailerSummary.rates.trustRejectionRate,
        failureClasses: lastIndexRun.retailerSummary.failureClasses as Record<string, number>,
        persistRejectionsByReason,
        productsIndexed: lastIndexRun.report.productsIndexed,
        offersWritten: lastIndexRun.report.offersWritten,
        amazonPaapi: lastIndexRun.report.amazonPaapi,
        bottleneck: lastIndexRun.telemetry?.bottleneck,
      }
    : undefined;

  if (acquisition && acquisition.offersWritten === 0 && products > 0) {
    persistenceNotes.push(
      `Last index run wrote zero verified offers — top rejections: ${
        Object.entries(persistRejectionsByReason)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, v]) => `${k}(${v})`)
          .join(", ") || "none recorded"
      }.`,
    );
  }

  return {
    generatedAt: now.toISOString(),
    database: {
      products,
      priceQuotes,
      activeQuotes,
      expiredQuotes,
      searchSessions,
      experimentBatches,
    },
    quotesBySource: bySourceRaw.map((r) => ({
      source: r.source,
      count: r._count._all,
      active: activeSourceMap.get(r.source) ?? 0,
    })),
    quotesByRetailer: byRetailerRaw.map((r) => ({
      retailerId: r.retailerId,
      count: r._count._all,
      active: activeRetailerMap.get(r.retailerId) ?? 0,
    })),
    ingestion: {
      amazonPaapiConfigured: isAmazonPaapiConfigured(),
      affiliateTagsConfigured,
    },
    artifacts,
    orchestration,
    cachedAcquisitionPaths,
    dataLossRiskFactors: DATA_LOSS_CAUSES,
    persistenceNotes,
    acquisition,
    freshness: {
      distribution: freshnessDistribution,
      ageHistogram,
      visibleQuotes,
      staleVisibleCount,
      refreshBacklog: refreshBacklog.totalCandidates,
      retailerPolicies: listRetailerFreshnessPolicies(),
      emptyCatalogRisk,
      frontendEmptyStateWarning,
    },
  };
}
