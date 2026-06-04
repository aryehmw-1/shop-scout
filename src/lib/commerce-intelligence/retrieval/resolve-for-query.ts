import { titleSimilarity } from "@/lib/demo-commerce/amazon-enrichment/similarity";
import { normalizeEnrichmentTitle } from "@/lib/demo-commerce/amazon-enrichment/normalize";
import { preferenceRankingBoost, resolveIntelligencePreferences } from "../personalization/preferences";
import type { ShoppingIntent } from "@/lib/types";
import type { CommerceIntelligenceGraph } from "../graph/types";
import { getPublishedGraphsCached } from "./graph-query-cache";
import { graphToRetrievalPayload, type CommerceRetrievalPayload } from "../ai/retrieval-payload";

const MIN_TITLE_SCORE = 0.38;
const MIN_IDENTITY_TO_PUBLISH = 0.45;
const MIN_VALIDATED_OFFERS = 2;

export interface IntelligenceMatch {
  graph: CommerceIntelligenceGraph;
  retrieval: CommerceRetrievalPayload;
  title_score: number;
  match_reason: string;
}

export interface ResolveIntelligenceResult {
  matches: IntelligenceMatch[];
  best?: IntelligenceMatch;
}

function scoreGraphForQuery(
  graph: CommerceIntelligenceGraph,
  queryNorm: string,
  intent?: Partial<ShoppingIntent>,
): { score: number; reason: string } {
  const titleScore = titleSimilarity(queryNorm, graph.canonical.title_normalized);
  let score = titleScore;
  let reason = `title_similarity=${titleScore.toFixed(3)}`;

  if (intent?.brand && graph.canonical.brand) {
    const brandHit = graph.canonical.brand
      .toLowerCase()
      .includes(intent.brand.toLowerCase());
    if (brandHit) {
      score += 0.08;
      reason += "; brand_match";
    }
  }

  if (intent?.category && graph.canonical.category === intent.category) {
    score += 0.05;
    reason += "; category_match";
  }

  score += graph.identity_confidence.overall * 0.12;
  reason += `; identity=${graph.identity_confidence.overall.toFixed(2)}`;

  const prefs = resolveIntelligencePreferences(intent, intent?.learningProfile);
  const validated = graph.offers.filter((o) => o.validation_status === "validated");
  let prefBoost = 0;
  for (const o of validated) {
    prefBoost = Math.max(
      prefBoost,
      preferenceRankingBoost(prefs, o.retailer, o.confidence?.overall ?? 0),
    );
  }
  if (prefBoost > 0) {
    score += prefBoost;
    reason += "; preference_boost";
  }

  return { score, reason };
}

/** Match user query → published intelligence graphs (deterministic, explainable). */
export function resolveIntelligenceForQuery(
  query: string,
  intent?: Partial<ShoppingIntent>,
  limit = 3,
): ResolveIntelligenceResult {
  const queryNorm = normalizeEnrichmentTitle(query, intent?.brand);
  if (queryNorm.length < 2) return { matches: [] };

  const graphs = getPublishedGraphsCached(MIN_IDENTITY_TO_PUBLISH).filter((g) => {
    const validated = g.offers.filter((o) => o.validation_status === "validated");
    return validated.length >= MIN_VALIDATED_OFFERS;
  });

  const ranked: IntelligenceMatch[] = [];

  for (const graph of graphs) {
    const { score, reason } = scoreGraphForQuery(graph, queryNorm, intent);
    if (score < MIN_TITLE_SCORE) continue;

    ranked.push({
      graph,
      retrieval: graphToRetrievalPayload(graph, query),
      title_score: score,
      match_reason: reason,
    });
  }

  ranked.sort((a, b) => b.title_score - a.title_score);

  const matches = ranked.slice(0, limit);
  return { matches, best: matches[0] };
}

export function shouldUseIntelligenceMatch(best?: IntelligenceMatch): boolean {
  if (!best) return false;
  return (
    best.title_score >= MIN_TITLE_SCORE &&
    best.retrieval.canonical.identity_confidence >= MIN_IDENTITY_TO_PUBLISH &&
    best.retrieval.offers.length >= MIN_VALIDATED_OFFERS
  );
}
