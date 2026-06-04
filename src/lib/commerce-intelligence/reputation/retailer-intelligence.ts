import type { RetailerId } from "@/lib/types";
import { loadAllGraphs } from "../graph/store";
import { buildRetailerPerformanceProfiles } from "../longitudinal/profiles";

export interface RetailerIntelligenceProfile {
  retailer: RetailerId;
  trustScore: number;
  shippingReliability: number;
  pricingVolatility: number;
  inventoryConsistency: number;
  staleOfferRate: number;
  disagreementFrequency: number;
  summary: string;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
}

export function buildRetailerIntelligenceProfiles(): RetailerIntelligenceProfile[] {
  const graphs = loadAllGraphs();
  const perf = buildRetailerPerformanceProfiles();
  const byRetailer = new Map(perf.map((p) => [p.retailer, p]));

  const offerStats = new Map<
    RetailerId,
    { stale: number; total: number; prices: number[]; fresh: number }
  >();

  for (const g of graphs) {
    for (const o of g.offers) {
      if (o.validation_status !== "validated") continue;
      const s = offerStats.get(o.retailer) ?? { stale: 0, total: 0, prices: [], fresh: 0 };
      s.total++;
      if (o.freshness_tier === "stale" || o.freshness_tier === "expired") s.stale++;
      else if (o.freshness_tier === "fresh") s.fresh++;
      s.prices.push(o.price);
      offerStats.set(o.retailer, s);
    }
  }

  const profiles: RetailerIntelligenceProfile[] = [];

  for (const [retailer, s] of offerStats) {
    const p = byRetailer.get(retailer);
    const staleRate = s.total ? s.stale / s.total : 0;
    const freshRate = s.total ? s.fresh / s.total : 0;

    let pricingVolatility = 0;
    if (s.prices.length >= 2) {
      const min = Math.min(...s.prices);
      const max = Math.max(...s.prices);
      pricingVolatility = max > 0 ? (max - min) / max : 0;
    }

    const disagreementFrequency = p?.disagreementRate ?? 0;
    const shippingReliability = clamp01(0.7 + freshRate * 0.25 - staleRate * 0.3);
    const inventoryConsistency = clamp01(1 - staleRate * 0.6);
    const trustScore = clamp01(
      (p?.avgCompositeWhenWon ?? 0.6) * 0.35 +
        shippingReliability * 0.2 +
        inventoryConsistency * 0.2 +
        (1 - pricingVolatility) * 0.15 +
        (1 - disagreementFrequency) * 0.1,
    );

    let summary = `${retailer}: `;
    if (trustScore >= 0.75) summary += "generally reliable for validated offers";
    else if (trustScore >= 0.55) summary += "mixed reliability — verify before purchase";
    else summary += "higher uncertainty — compare carefully";

    profiles.push({
      retailer,
      trustScore,
      shippingReliability,
      pricingVolatility: clamp01(pricingVolatility),
      inventoryConsistency,
      staleOfferRate: clamp01(staleRate),
      disagreementFrequency: clamp01(disagreementFrequency),
      summary,
    });
  }

  return profiles.sort((a, b) => b.trustScore - a.trustScore);
}

export function getRetailerIntelligence(retailer: RetailerId): RetailerIntelligenceProfile | undefined {
  return buildRetailerIntelligenceProfiles().find((p) => p.retailer === retailer);
}
