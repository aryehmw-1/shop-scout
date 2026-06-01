/**
 * Multi-strategy retailer acquisition — orchestration types.
 * Observability-first: lowest-cost reliable path with adaptive fallback.
 */
import type { RetailerId } from "../../types";
import type { LabFailureKind } from "../rendered-lab";

/** Supported acquisition methods per retailer capability registry. */
export type AcquisitionMethod =
  | "official_api"
  | "affiliate_feed"
  | "merchant_feed"
  | "public_structured"
  | "http_lightweight"
  | "browser_rendered"
  | "cached_structured";

export type AcquisitionFailureKind =
  | LabFailureKind
  | "rate_limited"
  | "not_configured"
  | "stale_cache"
  | "parse_error";

export interface AcquisitionMethodConfig {
  method: AcquisitionMethod;
  enabled: boolean;
  /** Relative cost 0..1 (0=cheapest). */
  costScore: number;
  /** Expected reliability 0..1 from historical metrics. */
  reliabilityScore: number;
  /** Max age for cached/feed data (ms). */
  freshnessTtlMs?: number;
  notes?: string;
}

export interface RetailerCapability {
  retailerId: RetailerId;
  methods: AcquisitionMethodConfig[];
  defaultMethod: AcquisitionMethod;
  challengeRate?: number;
  extractionConfidence?: number;
  freshnessGuaranteeMs?: number;
  lastUpdated: string;
}

export interface AcquisitionRequest {
  retailerId: RetailerId;
  url: string;
  productKey?: string;
  preferFresh?: boolean;
  maxCostScore?: number;
}

export interface AcquisitionResult {
  ok: boolean;
  method: AcquisitionMethod;
  retailerId: RetailerId;
  url: string;
  html?: string;
  status: number;
  failureKind?: AcquisitionFailureKind;
  classification?: { category: string; reason: string; vendor?: string };
  latencyMs: number;
  fromCache?: boolean;
  transport?: string;
  costScore?: number;
  escalated?: boolean;
  strategyAttempts: AcquisitionAttemptRecord[];
  extractionConfidence: number;
}

export interface AcquisitionAttemptRecord {
  method: AcquisitionMethod;
  ok: boolean;
  failureKind?: AcquisitionFailureKind;
  latencyMs: number;
  reason?: string;
  transport?: string;
  costScore?: number;
}

export interface StrategyHealthMetrics {
  retailerId: RetailerId;
  method: AcquisitionMethod;
  attempts: number;
  successRate: number;
  challengeRate: number;
  avgLatencyMs: number;
  avgCostScore: number;
  lastFailureKind?: AcquisitionFailureKind;
  updatedAt: string;
}
