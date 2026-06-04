import type { RetailerId } from "@/lib/types";

export interface OfferDecisionDimensions {
  confidence: number;
  pricingConsistency: number;
  retailerAgreement: number;
  freshness: number;
  identityCertainty: number;
  shippingAdjustedValue: number;
  historicalStability: number;
}

export interface CandidateComparison {
  offerId: string;
  retailer: RetailerId;
  retailerName: string;
  price: number;
  effectiveValue: number;
  compositeScore: number;
  rank: number;
  dimensions: OfferDecisionDimensions;
  vsWinnerSummary: string;
}

export interface ReasoningTraceStep {
  kind:
    | "evidence_used"
    | "evidence_rejected"
    | "ambiguity"
    | "uncertainty_penalty"
    | "tie_breaker"
    | "trust_memory";
  message: string;
  detail?: Record<string, string | number | boolean>;
}

export interface CounterfactualScenario {
  id: string;
  label: string;
  description: string;
  wouldChangeWinner: boolean;
  affectedRetailer?: string;
}

export interface RecommendationStability {
  volatile: boolean;
  volatilityScore: number;
  priorWinner?: string;
  winnerChangesLast7?: number;
  note?: string;
}

export interface PurchaseDecision {
  winnerOfferId: string;
  winnerRetailer: RetailerId;
  winnerRetailerName: string;
  winnerPrice: number;
  compositeScore: number;
  winnerRationale: string;
  whyThisWins: string[];
  candidates: CandidateComparison[];
  reasoningTrace: ReasoningTraceStep[];
  counterfactuals: CounterfactualScenario[];
  stability: RecommendationStability;
}
