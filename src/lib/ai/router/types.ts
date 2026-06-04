import type { AIProviderId } from "../providers/types";

export type AIWorkload =
  | "extraction"
  | "classification"
  | "analytical"
  | "synthesis"
  | "deep_research";

export interface RoutePlan {
  workload: AIWorkload;
  provider: AIProviderId;
  model: string;
  tier: "lightweight" | "standard" | "premium";
  escalateTo?: { provider: AIProviderId; model: string };
  reason: string;
}

export interface RouteRequest {
  workload: AIWorkload;
  /** When true, prefer stronger models even if more expensive */
  requireHighQuality?: boolean;
  estimatedInputTokens?: number;
}

export interface RoutedGenerateMeta {
  plan: RoutePlan;
  escalated: boolean;
  cacheHit: boolean;
  estimatedCostUsd?: number;
}
