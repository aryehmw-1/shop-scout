import { analyzeRecommendationVolatility, loadSnapshots } from "../drift/snapshots";
import type { CommerceIntelligenceGraph } from "../graph/types";

export interface StabilityForecast {
  confidenceDurabilityHours: number;
  expectedVolatility: number;
  freshnessDecayPerDay: number;
  recommendationHalfLifeHours: number;
  summary: string;
}

export function forecastRecommendationStability(
  graph: CommerceIntelligenceGraph,
): StabilityForecast {
  const volatility = analyzeRecommendationVolatility(graph.canonical.canonical_id);
  const snaps = loadSnapshots(graph.canonical.canonical_id);
  const validated = graph.offers.filter((o) => o.validation_status === "validated");

  const staleCount = validated.filter(
    (o) => o.freshness_tier === "stale" || o.freshness_tier === "expired",
  ).length;
  const freshnessDecayPerDay = validated.length ?
    staleCount / validated.length / 7
  : 0.05;

  const identity = graph.identity_confidence.overall;
  let confidenceDurabilityHours = 24 + identity * 48;
  if (volatility.volatile) confidenceDurabilityHours *= 0.6;

  const expectedVolatility = volatility.volatilityScore;
  const halfLife =
    confidenceDurabilityHours *
    (1 - expectedVolatility * 0.5) *
    (snaps.length >= 3 ? 1.2 : 0.8);

  let summary =
    identity >= 0.65 && !volatility.volatile ?
      "Recommendation expected to remain stable for ~1–2 days with routine rechecks."
    : volatility.volatile ?
      "Winner may change on recheck — treat as short-lived guidance."
    : "Moderate stability — recheck if purchase is not immediate.";

  return {
    confidenceDurabilityHours: Math.round(confidenceDurabilityHours),
    expectedVolatility,
    freshnessDecayPerDay: Math.round(freshnessDecayPerDay * 1000) / 1000,
    recommendationHalfLifeHours: Math.round(halfLife),
    summary,
  };
}
