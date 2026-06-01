/**
 * Offer freshness + stock confidence scoring for commerce intelligence.
 * Delegates tier classification to quote-freshness-policy.
 */

import type { ProductOffer } from "../types";
import {
  applyFreshnessToOffer,
  classifyOfferFreshness,
  type QuoteFreshnessTier,
} from "../pricing/quote-freshness-policy";

export type { QuoteFreshnessTier };

export interface OfferFreshnessMeta {
  freshnessScore: number;
  freshnessLabel: "live" | "fresh" | "aging" | "stale" | "estimated";
  freshnessTier: QuoteFreshnessTier;
  ageHours: number | null;
  isStale: boolean;
  stockConfidence: number;
  lastUpdatedAt?: string;
  displayLabel?: string;
}

export function computeOfferFreshness(offer: ProductOffer): OfferFreshnessMeta {
  const meta = classifyOfferFreshness(offer);
  const ageHours = Math.round(meta.ageMs / (60 * 60 * 1000));

  const freshnessLabel: OfferFreshnessMeta["freshnessLabel"] =
    meta.tier === "fresh" && (offer.priceSource === "scraped" || offer.priceSource === "connector_api")
      ? "live"
    : meta.tier === "fresh" ? "fresh"
    : meta.tier === "aging" ? "aging"
    : meta.tier === "stale_visible" ? "stale"
    : offer.priceSource === "catalog_model" ? "estimated"
    : "stale";

  let stockConfidence = offer.inStock ? 0.72 : 0.35;
  if (offer.verifiedPersistedInventory) stockConfidence += 0.15;
  if (offer.priceSource === "scraped" && offer.inStock) stockConfidence += 0.1;
  if (meta.tier === "stale_visible") stockConfidence -= 0.08;
  if (meta.tier === "expired") stockConfidence -= 0.15;
  stockConfidence = Math.min(0.98, Math.max(0.2, stockConfidence));

  return {
    freshnessScore: meta.decayedPriceConfidence,
    freshnessLabel,
    freshnessTier: meta.tier,
    ageHours,
    isStale: meta.tier === "stale_visible" || meta.tier === "expired",
    stockConfidence,
    lastUpdatedAt: meta.lastUpdatedAt,
    displayLabel: meta.displayLabel,
  };
}

export function applyOfferFreshness(offer: ProductOffer): ProductOffer {
  return applyFreshnessToOffer(offer);
}

export function rankByFreshnessAndDelivered(a: ProductOffer, b: ProductOffer): number {
  const fa = computeOfferFreshness(a);
  const fb = computeOfferFreshness(b);
  if (fa.isStale !== fb.isStale) return fa.isStale ? 1 : -1;
  const ds = a.landedCost - b.landedCost;
  if (Math.abs(ds) > 0.01) return ds;
  return fb.freshnessScore - fa.freshnessScore;
}
