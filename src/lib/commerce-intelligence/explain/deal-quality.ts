import type { RetailerOfferNode } from "../graph/types";

const SOURCE_RELIABILITY: Record<string, number> = {
  amazon_creators_api: 0.95,
  amazon_paapi: 0.92,
  impact_feed: 0.88,
  walmart_affiliate_api: 0.9,
  merchant_feed: 0.85,
  cached_quote: 0.7,
};

export interface DealQualityAssessment {
  score: number;
  label: "excellent" | "good" | "fair" | "weak";
  factors: string[];
}

export function assessDealQuality(offer: RetailerOfferNode): DealQualityAssessment {
  const factors: string[] = [];
  let score = 0.5;

  const conf = offer.confidence?.overall ?? 0;
  score += conf * 0.25;
  if (conf >= 0.7) factors.push("Strong offer confidence");
  else if (conf < 0.52) factors.push("Lower offer confidence");

  const src =
    SOURCE_RELIABILITY[offer.provenance.source_type] ??
    offer.provenance.source_reliability;
  score += src * 0.15;
  factors.push(`Source reliability ${Math.round(src * 100)}%`);

  if (offer.link_type === "pdp") {
    score += 0.08;
    factors.push("Direct product page");
  }

  if (offer.freshness_tier === "fresh") {
    score += 0.07;
  } else if (offer.freshness_tier === "stale" || offer.freshness_tier === "expired") {
    score -= 0.15;
    factors.push("Stale price data");
  }

  if (offer.was_price != null && offer.was_price > offer.price) {
    const pct = ((offer.was_price - offer.price) / offer.was_price) * 100;
    if (pct >= 40) {
      score -= 0.12;
      factors.push("Large was-price gap — verify discount");
    } else if (pct >= 10) {
      score += 0.04;
      factors.push("Modest sale vs was price");
    }
  }

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));

  const label: DealQualityAssessment["label"] =
    score >= 0.78 ? "excellent"
    : score >= 0.62 ? "good"
    : score >= 0.48 ? "fair"
    : "weak";

  return { score, label, factors };
}

/** Shipping-adjusted value when landed cost known (else price only). */
export function effectiveValueScore(offer: RetailerOfferNode): number {
  const base = offer.landed_cost ?? offer.price;
  const ship = offer.shipping_estimate ?? 0;
  return base + ship;
}
