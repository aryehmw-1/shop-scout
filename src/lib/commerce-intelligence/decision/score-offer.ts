import { titleSimilarity } from "@/lib/demo-commerce/amazon-enrichment/similarity";
import type { CommerceIntelligenceGraph, RetailerOfferNode } from "../graph/types";
import { effectiveValueScore } from "../explain/deal-quality";
import type { OfferDecisionDimensions } from "./types";

function freshnessScore(tier: RetailerOfferNode["freshness_tier"]): number {
  if (tier === "fresh") return 1;
  if (tier === "aging") return 0.75;
  if (tier === "stale") return 0.45;
  return 0.2;
}

export function scoreOfferDimensions(
  graph: CommerceIntelligenceGraph,
  offer: RetailerOfferNode,
  validated: RetailerOfferNode[],
  historicalStability: number,
): OfferDecisionDimensions {
  const prices = validated.map((o) => o.price).filter((p) => p > 0);
  const median =
    prices.length ?
      [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)]!
    : offer.price;

  const priceDev = median > 0 ? Math.abs(offer.price - median) / median : 0;
  const pricingConsistency = Math.max(0, 1 - priceDev);

  const values = validated.map(effectiveValueScore);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const ev = effectiveValueScore(offer);
  const shippingAdjustedValue =
    maxV > minV ? 1 - (ev - minV) / (maxV - minV) : 1;

  const titleSim = titleSimilarity(graph.canonical.title_normalized, offer.store_title);
  let confidence = offer.confidence?.overall ?? 0;
  if (titleSim < 0.35) confidence = Math.min(confidence, 0.45);

  return {
    confidence,
    pricingConsistency,
    retailerAgreement: graph.identity_confidence.multi_source_agreement,
    freshness: freshnessScore(offer.freshness_tier),
    identityCertainty: graph.identity_confidence.overall,
    shippingAdjustedValue,
    historicalStability,
  };
}

const WEIGHTS = {
  confidence: 0.22,
  pricingConsistency: 0.14,
  retailerAgreement: 0.1,
  freshness: 0.12,
  identityCertainty: 0.12,
  shippingAdjustedValue: 0.22,
  historicalStability: 0.08,
};

export function compositeDecisionScore(d: OfferDecisionDimensions): number {
  const raw =
    d.confidence * WEIGHTS.confidence +
    d.pricingConsistency * WEIGHTS.pricingConsistency +
    d.retailerAgreement * WEIGHTS.retailerAgreement +
    d.freshness * WEIGHTS.freshness +
    d.identityCertainty * WEIGHTS.identityCertainty +
    d.shippingAdjustedValue * WEIGHTS.shippingAdjustedValue +
    d.historicalStability * WEIGHTS.historicalStability;
  return Math.round(raw * 1000) / 1000;
}
