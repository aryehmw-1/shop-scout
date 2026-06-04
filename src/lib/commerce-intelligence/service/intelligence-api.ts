import { graphToRetrievalPayload } from "../ai/retrieval-payload";
import { buildRecommendationExplanation } from "../explain";
import type { RecommendationExplanation } from "../explain/types";
import { analyzeDriftAcrossCatalog } from "../drift/analyze";
import { loadGraph, loadAllGraphs } from "../graph/store";
import {
  buildCanonicalSurvivalProfiles,
  buildRetailerPerformanceProfiles,
} from "../longitudinal/profiles";
import { buildRetailerIntelligenceProfiles, getRetailerIntelligence } from "../reputation/retailer-intelligence";
import { resolveIntelligenceForQuery } from "../retrieval/resolve-for-query";
import { runAnalystPipeline } from "../workflow/analyst-pipeline";
import type { RetailerId } from "@/lib/types";
import type { ShoppingIntent } from "@/lib/types";

export function intelligenceRecommend(
  query: string,
  intent?: Partial<ShoppingIntent>,
): {
  matched: boolean;
  explanation?: RecommendationExplanation;
  retrieval?: ReturnType<typeof graphToRetrievalPayload>;
  matchReason?: string;
} {
  const { best } = resolveIntelligenceForQuery(query, intent ?? { query }, 1);
  if (!best) return { matched: false };

  const { explanation, retrieval } = runAnalystPipeline(best.graph, query, {
    personalizationNote: null,
    recordSnapshot: true,
  });

  return {
    matched: true,
    explanation,
    retrieval,
    matchReason: best.match_reason,
  };
}

export function intelligenceTrustSummary(canonicalId: string): RecommendationExplanation | null {
  const graph = loadGraph(canonicalId);
  if (!graph) return null;
  const retrieval = graphToRetrievalPayload(graph, graph.canonical.title);
  return buildRecommendationExplanation(graph, retrieval);
}

export function intelligenceDriftReport() {
  return analyzeDriftAcrossCatalog();
}

export function intelligenceRetailerProfiles() {
  return buildRetailerIntelligenceProfiles();
}

export function intelligenceRetailerProfile(retailer: RetailerId) {
  return getRetailerIntelligence(retailer);
}

export function intelligenceLongitudinal() {
  return {
    canonicalSurvival: buildCanonicalSurvivalProfiles(),
    retailerPerformance: buildRetailerPerformanceProfiles(),
  };
}

export function intelligenceCounterfactual(canonicalId: string) {
  const graph = loadGraph(canonicalId);
  if (!graph) return null;
  const retrieval = graphToRetrievalPayload(graph, graph.canonical.title);
  const explanation = buildRecommendationExplanation(graph, retrieval, {
    recordDecisionSnapshot: false,
  });
  return {
    canonicalId,
    counterfactuals: explanation.decision?.counterfactuals ?? [],
    winner: explanation.decision ?
      {
        retailer: explanation.decision.winnerRetailerName,
        price: explanation.decision.winnerPrice,
      }
    : null,
  };
}

export function intelligenceCatalogStats() {
  const graphs = loadAllGraphs();
  return {
    graphCount: graphs.length,
    validatedOffers: graphs.reduce(
      (n, g) => n + g.offers.filter((o) => o.validation_status === "validated").length,
      0,
    ),
  };
}
