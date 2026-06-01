/**
 * Proactive quote refresh scheduling — prioritize aging quotes before full expiry.
 */
import { prisma } from "../db/prisma";
import {
  classifyQuoteFreshness,
  consumerVisibleQuoteCutoff,
  getRetailerFreshnessPolicy,
  type QuoteFreshnessTier,
} from "../pricing/quote-freshness-policy";
import type { RetailerId } from "../types";

const VERIFIED_SOURCES = ["scraped", "connector_api", "daily_index", "nightly_index"];

export interface QuoteRefreshCandidate {
  quoteId: string;
  productId: string;
  catalogId: string;
  retailerId: RetailerId;
  productUrl: string;
  fetchedAt: string;
  tier: QuoteFreshnessTier;
  ageMs: number;
  priorityScore: number;
  reason: string;
}

export interface QuoteRefreshBacklog {
  generatedAt: string;
  totalCandidates: number;
  byTier: Record<QuoteFreshnessTier, number>;
  byRetailer: Record<string, number>;
  candidates: QuoteRefreshCandidate[];
}

function computePriorityScore(input: {
  tier: QuoteFreshnessTier;
  ageMs: number;
  searchFrequency: number;
  clickFrequency: number;
  refreshPriority: number;
  popularityScore: number;
}): number {
  let score = input.refreshPriority * 2 + input.popularityScore;
  score += input.searchFrequency * 3 + input.clickFrequency * 5;

  if (input.tier === "aging") score += 40;
  else if (input.tier === "stale_visible") score += 25;
  else if (input.tier === "expired") score += 10;
  else score += 5;

  score += Math.min(30, Math.round(input.ageMs / (60 * 60 * 1000)));
  return Math.round(score * 10) / 10;
}

export async function buildQuoteRefreshBacklog(limit = 100): Promise<QuoteRefreshBacklog> {
  const cutoff = consumerVisibleQuoteCutoff();
  const rows = await prisma.priceQuote.findMany({
    where: {
      source: { in: VERIFIED_SOURCES },
      fetchedAt: { gte: cutoff },
    },
    include: {
      product: {
        select: {
          catalogId: true,
          searchFrequency: true,
          clickFrequency: true,
          refreshPriority: true,
          popularityScore: true,
        },
      },
    },
    orderBy: { fetchedAt: "asc" },
    take: limit * 4,
  });

  const byTier: Record<QuoteFreshnessTier, number> = {
    fresh: 0,
    aging: 0,
    stale_visible: 0,
    expired: 0,
  };
  const byRetailer: Record<string, number> = {};

  const candidates: QuoteRefreshCandidate[] = [];

  for (const row of rows) {
    const retailerId = row.retailerId as RetailerId;
    const meta = classifyQuoteFreshness({
      fetchedAt: row.fetchedAt,
      retailerId,
      priceSource: row.source === "connector_api" ? "connector_api" : "scraped",
      matchConfidence: row.matchConfidence,
    });

    byTier[meta.tier] += 1;
    byRetailer[retailerId] = (byRetailer[retailerId] ?? 0) + 1;

    if (meta.tier === "fresh" && !meta.needsProactiveRefresh) continue;

    const policy = getRetailerFreshnessPolicy(retailerId);
    const cadenceDue =
      meta.ageMs >= policy.refreshCadenceMs - policy.proactiveRefreshLeadMs;

    if (!meta.needsProactiveRefresh && !cadenceDue && meta.tier === "fresh") continue;

    const reason =
      meta.needsProactiveRefresh ? "proactive_before_stale"
      : meta.tier === "stale_visible" ? "stale_visible_refresh"
      : meta.tier === "expired" ? "expired_recovery"
      : "cadence_due";

    candidates.push({
      quoteId: row.id,
      productId: row.productId,
      catalogId: row.product.catalogId,
      retailerId,
      productUrl: row.productUrl,
      fetchedAt: row.fetchedAt.toISOString(),
      tier: meta.tier,
      ageMs: meta.ageMs,
      priorityScore: computePriorityScore({
        tier: meta.tier,
        ageMs: meta.ageMs,
        searchFrequency: row.product.searchFrequency,
        clickFrequency: row.product.clickFrequency,
        refreshPriority: row.product.refreshPriority,
        popularityScore: row.product.popularityScore,
      }),
      reason,
    });
  }

  candidates.sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    generatedAt: new Date().toISOString(),
    totalCandidates: candidates.length,
    byTier,
    byRetailer,
    candidates: candidates.slice(0, limit),
  };
}

export async function countQuotesByFreshnessTier(): Promise<Record<QuoteFreshnessTier, number>> {
  const cutoff = consumerVisibleQuoteCutoff();
  const rows = await prisma.priceQuote.findMany({
    where: {
      source: { in: VERIFIED_SOURCES },
      fetchedAt: { gte: cutoff },
    },
    select: { fetchedAt: true, retailerId: true, matchConfidence: true, source: true },
  });

  const counts: Record<QuoteFreshnessTier, number> = {
    fresh: 0,
    aging: 0,
    stale_visible: 0,
    expired: 0,
  };

  for (const row of rows) {
    const meta = classifyQuoteFreshness({
      fetchedAt: row.fetchedAt,
      retailerId: row.retailerId as RetailerId,
      matchConfidence: row.matchConfidence,
      priceSource: row.source === "connector_api" ? "connector_api" : "scraped",
    });
    counts[meta.tier] += 1;
  }

  return counts;
}
