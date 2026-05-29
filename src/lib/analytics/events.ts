/** Product analytics event names — stored in LearningEvent.kind */

export type AnalyticsEventName =
  | "search_performed"
  | "search_first_results"
  | "enrichment_started"
  | "enrichment_completed"
  | "offer_click"
  | "best_deal_click"
  | "offer_save"
  | "watchlist_add"
  | "feedback_submitted"
  | "experiment_exposure"
  | "compare_view"
  | "page_view";

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  properties?: Record<string, string | number | boolean | null | undefined>;
  timestamp?: number;
  sessionId?: string;
}

export interface SearchAnalyticsProps {
  query: string;
  catalogId?: string;
  offerCount?: number;
  timeToFirstResultMs?: number;
  cacheHit?: boolean;
  progressive?: boolean;
}

export interface ClickAnalyticsProps {
  offerId: string;
  retailer: string;
  catalogId?: string;
  price?: number;
  isBestDeal?: boolean;
  dealScore?: number;
  percentBelowMarket?: number;
  experimentVariants?: Record<string, string>;
}

export interface EnrichmentAnalyticsProps {
  catalogId: string;
  latencyMs: number;
  offerCountBefore?: number;
  offerCountAfter?: number;
  success?: boolean;
}

export interface FeedbackAnalyticsProps {
  offerId: string;
  retailer: string;
  catalogId?: string;
  rating: "accurate" | "inaccurate";
  reason?: "wrong_product" | "price_outdated" | "bad_retailer_match" | "other";
  comment?: string;
}
