import "server-only";

// Batch validation jobs. Run nightly / on demand — NEVER during a user's live
// search. Processes newly-ingested RAW records and revalidates stale / uncertain
// catalog products in priority order.

import { prisma } from "../db/prisma";
import { processRawRecord } from "./pipeline";

export interface BatchOptions {
  limit?: number;
  useAi?: boolean;
}

export interface BatchSummary {
  processed: number;
  published: number;
  needsReview: number;
  rejected: number;
}

/**
 * Process pending RAW / CHECKED records through the pipeline.
 * Oldest scrape first so backlog drains fairly.
 */
export async function runRawValidationBatch(opts: BatchOptions = {}): Promise<BatchSummary> {
  const limit = opts.limit ?? 200;
  const records = await prisma.rawProductRecord.findMany({
    where: { processingStatus: { in: ["RAW", "CHECKED", "STALE"] } },
    orderBy: { scrapedAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const summary: BatchSummary = { processed: 0, published: 0, needsReview: 0, rejected: 0 };
  for (const { id } of records) {
    try {
      const { outcome } = await processRawRecord(id, { useAi: opts.useAi });
      summary.processed++;
      if (outcome.processingStatus === "PUBLISHED") summary.published++;
      else if (outcome.processingStatus === "NEEDS_REVIEW") summary.needsReview++;
      else if (outcome.processingStatus === "REJECTED") summary.rejected++;
    } catch (err) {
      console.error(`[pipeline.batch] failed record ${id}:`, err);
    }
  }
  return summary;
}

/** Aggregate counts for the admin dashboard. */
export async function validationStats() {
  const grouped = await prisma.rawProductRecord.groupBy({
    by: ["processingStatus"],
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.processingStatus] = g._count._all;

  return {
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    raw: counts.RAW ?? 0,
    checked: counts.CHECKED ?? 0,
    matched: counts.MATCHED ?? 0,
    verified: counts.VERIFIED ?? 0,
    published: counts.PUBLISHED ?? 0,
    needsReview: counts.NEEDS_REVIEW ?? 0,
    rejected: counts.REJECTED ?? 0,
    stale: counts.STALE ?? 0,
  };
}
