import { loadAnalyticsEvents } from "./events";
import { analyzeRecommendationUsefulness } from "./usefulness";
import { feedbackSummary } from "../feedback/product-feedback";
import { loadSessionReplay } from "../session-replay/store";

export interface OperationalInsight {
  id: string;
  priority: "high" | "medium" | "low";
  message: string;
  suggestedAction?: string;
}

export interface AnalyticsInterpretationReport {
  evaluatedAt: string;
  headline: string;
  insights: OperationalInsight[];
  metrics: {
    trustExpansionRate: number;
    analystEngagementRate: number;
    acceptanceProxy: number;
    usefulYes: number;
    usefulNo: number;
    sessionCount: number;
  };
}

/** Operator-readable narratives from privacy-safe analytics. */
export function buildAnalyticsInterpretation(): AnalyticsInterpretationReport {
  const usefulness = analyzeRecommendationUsefulness();
  const feedback = feedbackSummary();
  const sessions = loadSessionReplay().sessions;
  const events = loadAnalyticsEvents().events;

  const insights: OperationalInsight[] = [];
  const { engagement, outcomes, queryCategories } = usefulness;

  const topCategory = Object.entries(queryCategories).sort((a, b) => b[1] - a[1])[0];
  const noMatch = events.filter((e) => e.event === "recommendation_no_match").length;
  const abandon = events.filter((e) => e.event === "session_abandon").length;

  if (topCategory && topCategory[1] >= 3) {
    const cat = topCategory[0];
    const catSessions = sessions.filter((s) => s.queryCategory === cat);
    const expandRate =
      catSessions.length ?
        catSessions.filter((s) => s.interactionTrail.includes("trust_details_open")).length /
        catSessions.length
      : 0;
    if (expandRate > 0.35) {
      insights.push({
        id: "ambiguous_trust_expand",
        priority: "medium",
        message: `Users expand “Why this pick” more often on ${cat} queries — default summaries may need clearer uncertainty cues.`,
        suggestedAction: "Review trust copy for this category; A/B shorter vs explicit uncertainty line.",
      });
    }
  }

  if (outcomes.reversalRate > 0.12 && outcomes.reversals >= 2) {
    insights.push({
      id: "reversal_spike",
      priority: "high",
      message: "Recommendation reversals are elevated — users may be second-guessing winners after comparing stores.",
      suggestedAction: "Check drift reports and counterfactual visibility in default (not only More detail).",
    });
  }

  if (engagement.analystEngagementRate > 0.2 && engagement.recommendationsShown >= 5) {
    insights.push({
      id: "high_detail_demand",
      priority: "medium",
      message: "Users frequently open “More detail” — the default pick may not feel complete enough.",
      suggestedAction: "Surface one extra certainty line in the collapsed card without opening detail.",
    });
  }

  if (feedback.usefulNo > feedback.usefulYes && feedback.usefulNo >= 3) {
    insights.push({
      id: "negative_feedback",
      priority: "high",
      message: "Recent in-product feedback skews negative on usefulness.",
      suggestedAction: "Replay sessions in /debug/intelligence-sessions and inspect top whyNot reasons.",
    });
  }

  const groceryVolatility = sessions.filter(
    (s) => s.queryCategory === "grocery" && s.uncertaintyCount > 0,
  ).length;
  if (groceryVolatility >= 2) {
    insights.push({
      id: "grocery_trust",
      priority: "medium",
      message: "Grocery recommendations often carry uncertainty — retailer volatility may be hurting trust engagement.",
      suggestedAction: "Prioritize freshness signals in grocery trust summaries.",
    });
  }

  if (noMatch >= 5) {
    insights.push({
      id: "no_match_volume",
      priority: "medium",
      message: `${noMatch} queries had no intelligence match recently — users may see weaker recommendations.`,
      suggestedAction: "Expand catalog ingest or improve clarify-before-search for broad queries.",
    });
  }

  if (abandon >= 3) {
    insights.push({
      id: "session_abandon",
      priority: "medium",
      message: "Session abandon signals detected — check latency and empty-result UX.",
      suggestedAction: "Run session sim and review loading states in chat.",
    });
  }

  const topRetailer = usefulness.retailers[0];
  if (topRetailer && topRetailer.clicks >= 5) {
    insights.push({
      id: "retailer_preference",
      priority: "low",
      message: `Repeat engagement clusters on ${topRetailer.retailer} — preference ranking is learning weak signals (display only).`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "collecting",
      priority: "low",
      message: "Collecting beta signals — encourage lightweight feedback on recommendations to accelerate learning.",
      suggestedAction: "Enable INTELLIGENCE_BETA_MODE=1 and share with a small user cohort.",
    });
  }

  const headline =
    feedback.usefulYes + feedback.usefulNo >= 5 ?
      `${Math.round((feedback.usefulYes / (feedback.usefulYes + feedback.usefulNo)) * 100)}% marked recommendations useful in recent feedback`
    : engagement.recommendationsShown >= 10 ?
      `${Math.round(engagement.trustExpansionRate * 100)}% expand “Why this pick” · ${Math.round(engagement.analystEngagementRate * 100)}% use “More detail”`
    : "Beta learning in progress — low sample size";

  return {
    evaluatedAt: new Date().toISOString(),
    headline,
    insights: insights.sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 };
      return p[a.priority] - p[b.priority];
    }),
    metrics: {
      trustExpansionRate: engagement.trustExpansionRate,
      analystEngagementRate: engagement.analystEngagementRate,
      acceptanceProxy: outcomes.acceptanceProxy,
      usefulYes: feedback.usefulYes,
      usefulNo: feedback.usefulNo,
      sessionCount: sessions.length,
    },
  };
}
