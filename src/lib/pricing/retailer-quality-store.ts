import { prisma } from "../db/prisma";
import type { RetailerId } from "../types";
import type { RetailerEnrichmentAttempt } from "../offers/enrichment-report";

const EMA_ALPHA = 0.15;

function computeTrustScore(input: {
  fetchAttempts: number;
  fetchSuccesses: number;
  parserAttempts: number;
  parserSuccesses: number;
  offersRejected: number;
  offersAccepted: number;
  avgMatchConfidence: number;
}): number {
  const fetchRate =
    input.fetchAttempts > 0 ? input.fetchSuccesses / input.fetchAttempts : 0.5;
  const parserRate =
    input.parserAttempts > 0 ? input.parserSuccesses / input.parserAttempts : 0.5;
  const acceptTotal = input.offersAccepted + input.offersRejected;
  const acceptRate = acceptTotal > 0 ? input.offersAccepted / acceptTotal : 0.5;

  const score =
    fetchRate * 0.3 +
    parserRate * 0.25 +
    acceptRate * 0.25 +
    Math.min(1, input.avgMatchConfidence) * 0.2;

  return Math.round(Math.max(0.1, Math.min(1, score)) * 1000) / 1000;
}

export async function getRetailerTrustScore(retailerId: RetailerId): Promise<number> {
  const row = await prisma.retailerQualityMetric.findUnique({
    where: { retailerId },
    select: { trustScore: true },
  });
  return row?.trustScore ?? defaultTrustForRetailer(retailerId);
}

export async function getRetailerTrustScores(
  retailerIds: RetailerId[],
): Promise<Map<RetailerId, number>> {
  const rows = await prisma.retailerQualityMetric.findMany({
    where: { retailerId: { in: retailerIds } },
    select: { retailerId: true, trustScore: true },
  });
  const map = new Map<RetailerId, number>();
  for (const id of retailerIds) {
    map.set(id, defaultTrustForRetailer(id));
  }
  for (const r of rows) {
    map.set(r.retailerId as RetailerId, r.trustScore);
  }
  return map;
}

function defaultTrustForRetailer(retailerId: RetailerId): number {
  const core: Partial<Record<RetailerId, number>> = {
    amazon: 0.82,
    walmart: 0.72,
    target: 0.7,
    costco: 0.68,
    kroger: 0.66,
  };
  return core[retailerId] ?? 0.5;
}

export async function recordRetailerEnrichmentBatch(
  attempts: RetailerEnrichmentAttempt[],
): Promise<void> {
  for (const attempt of attempts) {
    await recordRetailerEnrichmentAttempt(attempt);
  }
}

export async function recordRetailerEnrichmentAttempt(
  attempt: RetailerEnrichmentAttempt,
): Promise<void> {
  const existing = await prisma.retailerQualityMetric.findUnique({
    where: { retailerId: attempt.retailer },
  });

  const fetchAttempts = (existing?.fetchAttempts ?? 0) + 1;
  const fetchSuccesses = (existing?.fetchSuccesses ?? 0) + (attempt.fetchOk ? 1 : 0);
  const parserAttempts = (existing?.parserAttempts ?? 0) + (attempt.fetchOk ? 1 : 0);
  const parserSuccesses =
    (existing?.parserSuccesses ?? 0) + (attempt.parserSuccess ? 1 : 0);
  const offersAccepted =
    (existing?.offersAccepted ?? 0) + (attempt.status === "success" ? 1 : 0);
  const offersRejected =
    (existing?.offersRejected ?? 0) + (attempt.status !== "success" ? 1 : 0);

  const prevConf = existing?.avgMatchConfidence ?? 0.5;
  const conf = attempt.adapterConfidence ?? prevConf;
  const avgMatchConfidence = prevConf * (1 - EMA_ALPHA) + conf * EMA_ALPHA;

  const prevLat = existing?.avgFetchLatencyMs ?? 0;
  const lat = attempt.fetchMs ?? prevLat;
  const avgFetchLatencyMs = prevLat * (1 - EMA_ALPHA) + lat * EMA_ALPHA;

  const trustScore = computeTrustScore({
    fetchAttempts,
    fetchSuccesses,
    parserAttempts,
    parserSuccesses,
    offersRejected,
    offersAccepted,
    avgMatchConfidence,
  });

  await prisma.retailerQualityMetric.upsert({
    where: { retailerId: attempt.retailer },
    create: {
      retailerId: attempt.retailer,
      fetchAttempts,
      fetchSuccesses,
      parserAttempts,
      parserSuccesses,
      offersAccepted,
      offersRejected,
      avgMatchConfidence,
      avgFetchLatencyMs,
      trustScore,
    },
    update: {
      fetchAttempts,
      fetchSuccesses,
      parserAttempts,
      parserSuccesses,
      offersAccepted,
      offersRejected,
      avgMatchConfidence,
      avgFetchLatencyMs,
      trustScore,
    },
  });
}

export async function recordOfferPersistOutcome(
  retailerId: RetailerId,
  accepted: boolean,
  matchConfidence?: number,
): Promise<void> {
  const existing = await prisma.retailerQualityMetric.findUnique({
    where: { retailerId },
  });
  const offersAccepted = (existing?.offersAccepted ?? 0) + (accepted ? 1 : 0);
  const offersRejected = (existing?.offersRejected ?? 0) + (accepted ? 0 : 1);
  const prevConf = existing?.avgMatchConfidence ?? 0.5;
  const conf = matchConfidence ?? prevConf;
  const avgMatchConfidence = prevConf * (1 - EMA_ALPHA) + conf * EMA_ALPHA;

  const trustScore = computeTrustScore({
    fetchAttempts: existing?.fetchAttempts ?? 0,
    fetchSuccesses: existing?.fetchSuccesses ?? 0,
    parserAttempts: existing?.parserAttempts ?? 0,
    parserSuccesses: existing?.parserSuccesses ?? 0,
    offersRejected,
    offersAccepted,
    avgMatchConfidence,
  });

  await prisma.retailerQualityMetric.upsert({
    where: { retailerId },
    create: {
      retailerId,
      offersAccepted,
      offersRejected,
      avgMatchConfidence,
      trustScore,
    },
    update: {
      offersAccepted,
      offersRejected,
      avgMatchConfidence,
      trustScore,
    },
  });
}
