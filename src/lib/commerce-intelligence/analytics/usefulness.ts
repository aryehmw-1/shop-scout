import { loadAnalyticsEvents } from "./events";
import { loadServerBehavioralStore } from "../feedback/server-store";

export interface UsefulnessReport {
  evaluatedAt: string;
  engagement: {
    recommendationsShown: number;
    trustDetailsOpens: number;
    analystModeOpens: number;
    trustExpansionRate: number;
    analystEngagementRate: number;
  };
  outcomes: {
    offerClicks: number;
    offerSaves: number;
    ignores: number;
    reversals: number;
    acceptanceProxy: number;
    reversalRate: number;
  };
  retailers: Array<{
    retailer: string;
    clicks: number;
    saves: number;
    ignores: number;
    repeatSelections: number;
  }>;
  queryCategories: Record<string, number>;
  insights: string[];
}

export function analyzeRecommendationUsefulness(): UsefulnessReport {
  const events = loadAnalyticsEvents().events;
  const behavioral = loadServerBehavioralStore();

  const count = (type: string) => events.filter((e) => e.event === type).length;

  const shown = count("recommendation_shown");
  const trustOpen = count("trust_details_open");
  const analystOpen = count("analyst_mode_open");
  const clicks = count("offer_click") + Object.values(behavioral.retailers).reduce((n, r) => n + (r?.clicks ?? 0), 0);
  const saves = count("offer_save") + Object.values(behavioral.retailers).reduce((n, r) => n + (r?.saves ?? 0), 0);
  const ignores = count("recommendation_ignore") + Object.values(behavioral.retailers).reduce((n, r) => n + (r?.ignores ?? 0), 0);
  const reversals = Object.values(behavioral.retailers).reduce((n, r) => n + (r?.reversals ?? 0), 0);

  const queryCategories: Record<string, number> = {};
  for (const e of events) {
    if (e.event === "query_category" && e.queryCategory) {
      queryCategories[e.queryCategory] = (queryCategories[e.queryCategory] ?? 0) + 1;
    }
  }

  const retailers = Object.entries(behavioral.retailers).map(([retailer, r]) => ({
    retailer,
    clicks: r?.clicks ?? 0,
    saves: r?.saves ?? 0,
    ignores: r?.ignores ?? 0,
    repeatSelections: r?.repeatSelections ?? 0,
  }));

  retailers.sort((a, b) => b.clicks - a.clicks);

  const engaged = clicks + saves;
  const acceptanceProxy = engaged + ignores > 0 ? engaged / (engaged + ignores) : 0;
  const reversalRate = engaged > 0 ? reversals / engaged : 0;

  const insights: string[] = [];
  if (shown > 0 && trustOpen / shown < 0.1) {
    insights.push("Low trust-detail expansion — users may find default summary sufficient (good) or miss the affordance.");
  }
  if (shown > 0 && analystOpen / shown > 0.25) {
    insights.push("High analyst-mode usage — consider simplifying default copy further.");
  }
  if (acceptanceProxy < 0.3 && ignores > 5) {
    insights.push("High ignore rate vs clicks — review recommendation relevance or query matching.");
  }
  if (reversalRate > 0.15) {
    insights.push("Elevated reversals — winner stability or counterfactual messaging may need tuning.");
  }
  if (insights.length === 0) {
    insights.push("Insufficient traffic for strong conclusions — continue collecting privacy-safe analytics.");
  }

  return {
    evaluatedAt: new Date().toISOString(),
    engagement: {
      recommendationsShown: shown,
      trustDetailsOpens: trustOpen,
      analystModeOpens: analystOpen,
      trustExpansionRate: shown ? trustOpen / shown : 0,
      analystEngagementRate: shown ? analystOpen / shown : 0,
    },
    outcomes: {
      offerClicks: clicks,
      offerSaves: saves,
      ignores,
      reversals,
      acceptanceProxy: Math.round(acceptanceProxy * 1000) / 1000,
      reversalRate: Math.round(reversalRate * 1000) / 1000,
    },
    retailers: retailers.slice(0, 20),
    queryCategories,
    insights,
  };
}
