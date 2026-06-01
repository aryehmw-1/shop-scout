/**
 * Cached structured quote path — use durable DB quotes before live fetch.
 */
import { prisma } from "../../db/prisma";
import type { RetailerId } from "../../types";
import type { AcquisitionAttemptRecord } from "./types";
import { consumerVisibleQuoteCutoff } from "../../pricing/quote-freshness-policy";

export interface CachedQuoteHit {
  ok: boolean;
  html?: string;
  status: number;
  fromCache: boolean;
  extractionConfidence: number;
  reason?: string;
}

export async function tryCachedStructuredQuote(
  retailerId: RetailerId,
  url: string,
  freshnessTtlMs = 7_200_000,
): Promise<CachedQuoteHit> {
  const cutoff = consumerVisibleQuoteCutoff(retailerId);
  const row = await prisma.priceQuote.findFirst({
    where: {
      retailerId,
      fetchedAt: { gte: cutoff },
      OR: [{ productUrl: url }, { productUrl: { contains: url.slice(0, 80) } }],
    },
    orderBy: { fetchedAt: "desc" },
    select: {
      priceUsd: true,
      fetchedAt: true,
      expiresAt: true,
      productUrl: true,
      storeTitle: true,
    },
  });

  if (!row) {
    return {
      ok: false,
      status: 0,
      fromCache: false,
      extractionConfidence: 0,
      reason: "no_fresh_cached_quote",
    };
  }

  const ageMs = Date.now() - row.fetchedAt.getTime();
  const freshness = Math.max(0, 1 - ageMs / freshnessTtlMs);
  const syntheticHtml = `<!-- cached_structured quote retailer=${retailerId} price=${row.priceUsd} -->`;

  return {
    ok: true,
    html: syntheticHtml,
    status: 200,
    fromCache: true,
    extractionConfidence: Math.round(freshness * 0.85 * 1000) / 1000,
    reason: `cached_quote age=${Math.round(ageMs / 1000)}s`,
  };
}

export function asAttemptRecord(
  hit: CachedQuoteHit,
  latencyMs: number,
): AcquisitionAttemptRecord {
  return {
    method: "cached_structured",
    ok: hit.ok,
    failureKind: hit.ok ? undefined : "stale_cache",
    latencyMs,
    reason: hit.reason,
    transport: "direct",
    costScore: 0.05,
  };
}
