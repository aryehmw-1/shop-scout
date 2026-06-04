import type { PurchaseDecision } from "../decision/types";

/** User-facing, deterministic recommendation explanation (no LLM required). */
export type ConfidenceBand = "high" | "medium" | "low";

export interface ConfidenceDimension {
  key: string;
  label: string;
  value: number;
  detail?: string;
}

export interface OfferTrustInsight {
  offerId: string;
  retailer: string;
  retailerName: string;
  price: number;
  confidence: number;
  band: ConfidenceBand;
  trustLabel: string;
  bullets: string[];
  sourceType: string;
  freshness: string;
}

export interface RecommendationExplanation {
  canonicalId: string;
  productTitle: string;
  headline: string;
  whyRecommended: string;
  identity: {
    overall: number;
    band: ConfidenceBand;
    breakdown: ConfidenceDimension[];
    reasons: string[];
  };
  retailerAgreement: {
    validatedOfferCount: number;
    retailerCount: number;
    sourceTypes: string[];
    agreementLabel: string;
  };
  evidence: {
    count: number;
    summaries: string[];
  };
  consensus?: {
    minPrice: number;
    maxPrice: number;
    medianPrice: number;
    spreadRatio: number;
    offerCount: number;
    bestRetailer: string;
    savingsVsHighest: number;
  };
  uncertainty: Array<{ level: "info" | "warning"; message: string }>;
  fakeDiscountWarnings: Array<{ retailer: string; message: string }>;
  safestPurchase?: { retailer: string; reason: string };
  bestValue?: { retailer: string; price: number; reason: string };
  worthWaiting?: { suggest: boolean; reason: string };
  offerInsights: OfferTrustInsight[];
  /** Primary UX — concise, calm trust line */
  trustSummary: string;
  /** Optional preference note (ranking only, not confidence) */
  personalizationNote?: string | null;
  dealQualityLabel?: string;
  /** Deterministic winner selection + analyst trace */
  decision?: PurchaseDecision;
  /** Short deterministic investigation summary (analyst mode) */
  investigationSummary?: string;
  /** Longitudinal / market / reputation context (deterministic) */
  adaptive?: {
    marketSignals: Array<{
      kind: string;
      severity: string;
      message: string;
      retailers?: string[];
    }>;
    stabilityForecast: {
      confidenceDurabilityHours: number;
      expectedVolatility: number;
      freshnessDecayPerDay: number;
      recommendationHalfLifeHours: number;
      summary: string;
    };
    retailerIntelligence: Array<{
      retailer: string;
      trustScore: number;
      summary: string;
      staleOfferRate: number;
      pricingVolatility: number;
    }>;
  };
}
