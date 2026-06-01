/**
 * Tiered quote freshness — durable visibility with graceful degradation.
 *
 * Tiers (by age since fetchedAt):
 *   fresh            — full confidence, live labeling
 *   aging            — visible, moderate confidence decay
 *   stale_visible    — visible up to ~7d with clear stale labeling
 *   expired          — hidden only when confidence is critically low
 */
import type { RetailerId } from "../types";
import type { ProductOffer } from "../types";

export type QuoteFreshnessTier = "fresh" | "aging" | "stale_visible" | "expired";

export interface RetailerFreshnessPolicy {
  retailerId: RetailerId;
  /** Full-confidence window (default 6h). */
  freshMaxAgeMs: number;
  /** Aging window end (default 24h). */
  agingMaxAgeMs: number;
  /** Stale-but-visible window end (default 7d). */
  staleVisibleMaxAgeMs: number;
  /** Hard DB purge / archival (default 14d). */
  hardExpireMs: number;
  /** Start proactive refresh this long before aging→stale boundary. */
  proactiveRefreshLeadMs: number;
  /** Below this decayed price confidence, hide offer entirely. */
  minDisplayConfidence: number;
  /** Refresh cadence hint for scheduler. */
  refreshCadenceMs: number;
}

const DEFAULT_POLICY: Omit<RetailerFreshnessPolicy, "retailerId"> = {
  freshMaxAgeMs: 6 * 60 * 60 * 1000,
  agingMaxAgeMs: 24 * 60 * 60 * 1000,
  staleVisibleMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  hardExpireMs: 14 * 24 * 60 * 60 * 1000,
  proactiveRefreshLeadMs: 12 * 60 * 60 * 1000,
  minDisplayConfidence: 0.32,
  refreshCadenceMs: 24 * 60 * 60 * 1000,
};

const RETAILER_POLICIES: Partial<Record<RetailerId, Partial<RetailerFreshnessPolicy>>> = {
  amazon: {
    freshMaxAgeMs: 4 * 60 * 60 * 1000,
    agingMaxAgeMs: 18 * 60 * 60 * 1000,
    staleVisibleMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    refreshCadenceMs: 12 * 60 * 60 * 1000,
  },
  target: {
    freshMaxAgeMs: 6 * 60 * 60 * 1000,
    agingMaxAgeMs: 24 * 60 * 60 * 1000,
    staleVisibleMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    refreshCadenceMs: 24 * 60 * 60 * 1000,
  },
  walmart: {
    freshMaxAgeMs: 8 * 60 * 60 * 1000,
    agingMaxAgeMs: 36 * 60 * 60 * 1000,
    staleVisibleMaxAgeMs: 5 * 24 * 60 * 60 * 1000,
    refreshCadenceMs: 48 * 60 * 60 * 1000,
  },
  kroger: {
    staleVisibleMaxAgeMs: 5 * 24 * 60 * 60 * 1000,
    refreshCadenceMs: 48 * 60 * 60 * 1000,
  },
  costco: {
    staleVisibleMaxAgeMs: 5 * 24 * 60 * 60 * 1000,
    refreshCadenceMs: 72 * 60 * 60 * 1000,
  },
};

export function getRetailerFreshnessPolicy(retailerId: RetailerId = "amazon"): RetailerFreshnessPolicy {
  const overrides = RETAILER_POLICIES[retailerId] ?? {};
  return { retailerId, ...DEFAULT_POLICY, ...overrides };
}

export function listRetailerFreshnessPolicies(): RetailerFreshnessPolicy[] {
  const ids = new Set<RetailerId>([
    "amazon",
    "target",
    "walmart",
    "kroger",
    "costco",
    ...(Object.keys(RETAILER_POLICIES) as RetailerId[]),
  ]);
  return [...ids].map(getRetailerFreshnessPolicy);
}

export interface QuoteFreshnessClassification {
  tier: QuoteFreshnessTier;
  ageMs: number;
  lastUpdatedAt: string;
  decayedPriceConfidence: number;
  displayLabel: string;
  shortLabel: string;
  isVisible: boolean;
  shouldSoftHidePrice: boolean;
  needsProactiveRefresh: boolean;
  policy: RetailerFreshnessPolicy;
}

function parseTimestamp(input?: string | Date | null): number | null {
  if (!input) return null;
  const t = input instanceof Date ? input.getTime() : new Date(input).getTime();
  return Number.isFinite(t) ? t : null;
}

function resolveFetchedAt(input: {
  fetchedAt?: string | Date;
  priceAsOf?: string;
  lastVerifiedAt?: string;
  priceExpiresAt?: string;
}): number {
  return (
    parseTimestamp(input.fetchedAt) ??
    parseTimestamp(input.priceAsOf) ??
    parseTimestamp(input.lastVerifiedAt) ??
    Date.now()
  );
}

function tierFromAge(ageMs: number, policy: RetailerFreshnessPolicy): QuoteFreshnessTier {
  if (ageMs <= policy.freshMaxAgeMs) return "fresh";
  if (ageMs <= policy.agingMaxAgeMs) return "aging";
  if (ageMs <= policy.staleVisibleMaxAgeMs) return "stale_visible";
  return "expired";
}

function decayConfidence(
  tier: QuoteFreshnessTier,
  ageMs: number,
  policy: RetailerFreshnessPolicy,
  baseConfidence: number,
): number {
  const base = Math.min(1, Math.max(0, baseConfidence));
  switch (tier) {
    case "fresh":
      return base;
    case "aging": {
      const progress = (ageMs - policy.freshMaxAgeMs) / Math.max(policy.agingMaxAgeMs - policy.freshMaxAgeMs, 1);
      return base * (1 - progress * 0.12);
    }
    case "stale_visible": {
      const span = policy.staleVisibleMaxAgeMs - policy.agingMaxAgeMs;
      const progress = span > 0 ? (ageMs - policy.agingMaxAgeMs) / span : 1;
      return base * (0.82 - progress * 0.38);
    }
    case "expired":
      return Math.max(policy.minDisplayConfidence, base * 0.35);
  }
}

function formatAgeLabel(ageMs: number): string {
  const mins = Math.round(ageMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function tierDisplayLabel(tier: QuoteFreshnessTier, ageLabel: string): string {
  switch (tier) {
    case "fresh":
      return `Updated ${ageLabel}`;
    case "aging":
      return `Updated ${ageLabel} · verify at checkout`;
    case "stale_visible":
      return `Price from ${ageLabel} · may have changed`;
    case "expired":
      return `Last seen ${ageLabel} · price may be outdated`;
  }
}

function tierShortLabel(tier: QuoteFreshnessTier): string {
  switch (tier) {
    case "fresh":
      return "Fresh";
    case "aging":
      return "Aging";
    case "stale_visible":
      return "Stale";
    case "expired":
      return "Expired";
  }
}

/** Classify quote freshness from timestamps and retailer policy. */
export function classifyQuoteFreshness(input: {
  fetchedAt?: string | Date;
  priceAsOf?: string;
  lastVerifiedAt?: string;
  priceExpiresAt?: string;
  retailerId?: RetailerId;
  priceSource?: ProductOffer["priceSource"];
  matchConfidence?: number;
  priceConfidence?: number;
}): QuoteFreshnessClassification {
  const retailerId = input.retailerId ?? "amazon";
  const policy = getRetailerFreshnessPolicy(retailerId);
  const fetchedMs = resolveFetchedAt(input);
  const ageMs = Math.max(0, Date.now() - fetchedMs);
  const lastUpdatedAt = new Date(fetchedMs).toISOString();

  const isLiveNow =
    input.priceSource === "scraped" || input.priceSource === "connector_api";
  const tier: QuoteFreshnessTier =
    isLiveNow && ageMs <= policy.freshMaxAgeMs ? "fresh" : tierFromAge(ageMs, policy);

  const baseConfidence =
    input.priceConfidence ?? input.matchConfidence ?? 0.78;
  const decayedPriceConfidence =
    Math.round(decayConfidence(tier, ageMs, policy, baseConfidence) * 1000) / 1000;

  const ageLabel = formatAgeLabel(ageMs);
  const criticallyLow =
    decayedPriceConfidence < policy.minDisplayConfidence &&
    (input.matchConfidence ?? 0) < 0.55;

  const isVisible = tier !== "expired" || !criticallyLow;
  const shouldSoftHidePrice = tier === "expired" && decayedPriceConfidence < 0.45;

  const staleBoundary = policy.staleVisibleMaxAgeMs - policy.proactiveRefreshLeadMs;
  const needsProactiveRefresh =
    ageMs >= policy.agingMaxAgeMs && ageMs <= staleBoundary;

  return {
    tier,
    ageMs,
    lastUpdatedAt,
    decayedPriceConfidence,
    displayLabel: tierDisplayLabel(tier, ageLabel),
    shortLabel: tierShortLabel(tier),
    isVisible,
    shouldSoftHidePrice,
    needsProactiveRefresh,
    policy,
  };
}

export function classifyOfferFreshness(offer: ProductOffer): QuoteFreshnessClassification {
  return classifyQuoteFreshness({
    priceAsOf: offer.priceAsOf,
    lastVerifiedAt: offer.lastVerifiedAt,
    priceExpiresAt: offer.priceExpiresAt,
    retailerId: offer.retailer,
    priceSource: offer.priceSource,
    matchConfidence: offer.matchConfidence,
    priceConfidence: offer.priceConfidence,
  });
}

/** DB expiresAt — hard purge only after visible window + grace. */
export function computePersistExpiresAt(
  fetchedAt: Date,
  retailerId: RetailerId,
): Date {
  const policy = getRetailerFreshnessPolicy(retailerId);
  return new Date(fetchedAt.getTime() + policy.hardExpireMs);
}

/** Prisma filter: include quotes within consumer-visible window. */
export function consumerVisibleQuoteCutoff(retailerId?: RetailerId): Date {
  const policy = getRetailerFreshnessPolicy(retailerId ?? "amazon");
  return new Date(Date.now() - policy.hardExpireMs);
}

export function consumerVisibleQuoteWhere(retailerId?: RetailerId) {
  const cutoff = consumerVisibleQuoteCutoff(retailerId);
  return {
    OR: [
      { fetchedAt: { gte: cutoff } },
      { expiresAt: { gt: new Date() } },
    ],
  };
}

export function isQuoteVisibleForDisplay(offer: ProductOffer): boolean {
  return classifyOfferFreshness(offer).isVisible;
}

/** @deprecated Use isQuoteVisibleForDisplay — kept for diagnostics. */
export function isQuoteFreshStrict(offer: ProductOffer): boolean {
  const tier = classifyOfferFreshness(offer).tier;
  return tier === "fresh" || tier === "aging";
}

export function applyFreshnessToOffer(offer: ProductOffer): ProductOffer {
  const meta = classifyOfferFreshness(offer);
  const priceNote =
    meta.tier === "fresh" ? offer.priceNote
    : meta.tier === "aging" ? `${offer.priceNote ?? "Price"} · ${meta.displayLabel}`
    : meta.displayLabel;

  return {
    ...offer,
    freshnessTier: meta.tier,
    freshnessLabel: meta.shortLabel,
    lastUpdatedAt: meta.lastUpdatedAt,
    displayPriceConfidence: meta.decayedPriceConfidence,
    priceConfidence: Math.min(offer.priceConfidence ?? 1, meta.decayedPriceConfidence),
    priceNote,
    confidenceReasons: [
      ...(offer.confidenceReasons ?? []).filter((r) => !r.code.startsWith("freshness.")),
      {
        code: `freshness.${meta.tier}`,
        message: meta.displayLabel,
        weight: meta.decayedPriceConfidence - 0.5,
      },
    ],
  };
}

export type FreshnessHistogramBucket = "0-6h" | "6-24h" | "1-3d" | "3-7d" | "7d+";

export function freshnessHistogramBucket(ageMs: number): FreshnessHistogramBucket {
  if (ageMs <= 6 * 60 * 60 * 1000) return "0-6h";
  if (ageMs <= 24 * 60 * 60 * 1000) return "6-24h";
  if (ageMs <= 3 * 24 * 60 * 60 * 1000) return "1-3d";
  if (ageMs <= 7 * 24 * 60 * 60 * 1000) return "3-7d";
  return "7d+";
}
