import type { IntelligenceInsight, ProductSearchResults, ShoppingIntent } from "@/lib/types";
import { recordAnalyticsEvent } from "../analytics/events";
import { inferQueryCategory } from "../analytics/query-category";
import { launchFlags } from "../ops/feature-flags";
import { hashSessionId, recordSessionReplay } from "../session-replay/store";
import { runAnalystPipeline } from "../workflow/analyst-pipeline";
import {
  personalizationSummary,
  resolveIntelligencePreferences,
} from "../personalization/preferences";
import { rankOffersWithPreferences } from "../personalization/rank-offers";
import { graphToProductSearchResults } from "./graph-to-search-results";
import {
  resolveIntelligenceForQuery,
  shouldUseIntelligenceMatch,
} from "./resolve-for-query";
import type { CommerceRetrievalPayload } from "../ai/retrieval-payload";

export interface IntelligenceSearchResult {
  productResults: ProductSearchResults;
  retrievalPayload: CommerceRetrievalPayload;
  commerceInsight: IntelligenceInsight;
  matchScore: number;
  matchReason: string;
}

/** Prefer commerce intelligence graph when match quality is sufficient. */
export function tryIntelligenceSearch(
  intent: ShoppingIntent,
  zipCode?: string,
): IntelligenceSearchResult | null {
  if (!launchFlags.intelligenceEnabled) return null;

  const query = intent.query?.trim();
  if (!query || query.length < 3) return null;

  if (launchFlags.analytics) {
    recordAnalyticsEvent({
      event: "query_category",
      queryCategory: inferQueryCategory(query),
    });
  }

  const { best } = resolveIntelligenceForQuery(query, intent, 1);
  if (!shouldUseIntelligenceMatch(best)) {
    if (launchFlags.analytics) {
      recordAnalyticsEvent({ event: "recommendation_no_match", meta: { category: inferQueryCategory(query) } });
    }
    return null;
  }

  const zip = zipCode ?? intent.zipCode ?? "78701";
  const prefs = resolveIntelligencePreferences(intent, intent.learningProfile);
  const note = personalizationSummary(prefs);
  const { explanation: insight } = runAnalystPipeline(best!.graph, query, {
    personalizationNote: note,
    recordSnapshot: true,
  });

  const productResults = graphToProductSearchResults(
    best!.graph,
    best!.retrieval,
    zip,
    insight,
  );
  productResults.online = rankOffersWithPreferences(productResults.online, prefs);

  recordSessionReplay({
    sessionId: hashSessionId(`${query}:${best!.graph.canonical.canonical_id}`),
    query,
    queryCategory: inferQueryCategory(query),
    matched: true,
    explanation: insight,
  });

  return {
    productResults,
    retrievalPayload: best!.retrieval,
    commerceInsight: insight,
    matchScore: best!.title_score,
    matchReason: best!.match_reason,
  };
}
