/**
 * Experiment framework types — controlled A/B and one-factor-at-a-time matrices
 * for anti-bot observability (not evasion tuning).
 */
import type { RetailerId } from "../../types";
import type { ProxyTransport } from "../../net/proxy-routing";
import type { SessionBehaviorId } from "../session-behavior";
import type { WaitStrategy, BlockableResource } from "../navigation-strategy";
import type { WarmupMode } from "../warm-session";
import type { LabFailureKind } from "../rendered-lab";
import type { RealismSignals } from "../browser-realism";
import type { ResponseClassification } from "../../net/response-classification";
import type { NavigationLifecycle } from "../navigation-strategy";
import type { TransportIdentity } from "../../net/transport-identity";
import type { CoherenceResult } from "../../net/geo-coherence";
// import type { RenderedFetchResult } from "../../offers/retailer-adapters/rendered-fetch";

/** Temporary local shape while rendered-fetch module is unavailable. */
export interface RenderedFetchResult {
  ok: boolean;
  status: number;
  html?: string;
  finalUrl?: string;
  failureKind?: LabFailureKind;
  error?: string;
  classification: ResponseClassification;
  lifecycle?: NavigationLifecycle;
  redirectChain?: Array<{ url: string; status: number }>;
  identity?: TransportIdentity;
  coherence?: CoherenceResult;
  realism?: RealismSignals;
  suspicion?: { score?: number; reasons?: string[] };
  challenge?: { score?: number; factors?: string[] };
  timingMs: number;
  artifactDir?: string | null;
  proxyUsed?: boolean;
  transport?: string;
  behavior?: string;
  warmupMode?: string;
  sticky?: boolean;
  geoCountry?: string;
}

/** Stub result when rendered-fetch is disabled (build / deploy). */
export function stubRenderedFetchDisabled(
  reason = "rendered-fetch temporarily disabled",
): RenderedFetchResult {
  return {
    ok: false,
    status: 0,
    error: reason,
    failureKind: "unknown",
    classification: {
      ok: false,
      category: "empty",
      reason: "not_configured",
      confidence: 1,
      indicators: [reason],
      status: 0,
      bytes: 0,
    },
    timingMs: 0,
    artifactDir: null,
  };
}

/** Factors we can vary independently in the matrix runner. */
export type ExperimentFactorId =
  | "transport"
  | "behavior"
  | "warmup"
  | "waitStrategy"
  | "blockResources"
  | "earlyExtraction"
  | "sticky"
  | "geoCountry"
  | "viewport"
  | "sessionPersistence";

/** Baseline configuration all cells inherit unless overridden. */
export interface ExperimentBaseline {
  transport?: ProxyTransport;
  behavior?: SessionBehaviorId;
  warmup?: boolean | "homepage";
  waitStrategy?: WaitStrategy;
  blockResources?: BlockableResource[];
  earlyExtraction?: boolean;
  sticky?: boolean;
  geoCountry?: string;
  /** e.g. "1366x900" or "1920x1080" */
  viewport?: string;
  sessionPersistence?: boolean;
  country?: string;
  region?: string;
}

/** Single override cell in a one-factor-at-a-time matrix. */
export interface ExperimentCellSpec {
  id: string;
  factor: ExperimentFactorId;
  factorValue: string;
  label: string;
  overrides: ExperimentBaseline;
  isBaseline?: boolean;
}

/** Reusable preset per retailer. */
export interface ExperimentPreset {
  id: string;
  retailerId: RetailerId;
  label: string;
  description?: string;
  targetUrl?: string;
  baseline: ExperimentBaseline;
  /** Factor → allowed values (baseline value must be included). */
  factorLevels: Partial<Record<ExperimentFactorId, string[]>>;
  /** When true, generate one cell per non-baseline level (OAT). */
  oneAtATime: boolean;
}

export interface ExperimentBatchSpec {
  presetId?: string;
  retailerId: RetailerId;
  targetUrl: string;
  baseline: ExperimentBaseline;
  cells: ExperimentCellSpec[];
  cooldownMs?: number;
  probeIdentityOnce?: boolean;
}

export interface ChallengeAnalytics {
  challenged: boolean;
  challengeType: string;
  vendor?: string;
  reason: string;
  confidence: number;
  redirectChain: Array<{ url: string; status: number }>;
  blockedToInterstitial: boolean;
  domBytes: number;
  domCompleteness: number;
  extractionSuccess: boolean;
  lifecycleTimedOut: boolean;
  telemetryFailures: string[];
  blockedEndpoints: string[];
  pxNetworkCalls: string[];
  failedRequests: Array<{ url: string; failure?: string }>;
}

export interface FingerprintSnapshot {
  capturedAt: string;
  signals: RealismSignals;
  coherenceScore?: number;
  storageAvailable: boolean;
  cookieEnabled: boolean;
}

export interface FingerprintDiffEntry {
  field: string;
  baseline?: unknown;
  challenged?: unknown;
  delta?: string;
}

export interface SessionScore {
  sessionId: string;
  cellId: string;
  challenged: boolean;
  challengeProbability?: number;
  botSuspicion?: number;
  failureKind: LabFailureKind;
  extractionConfidence: number;
  factorVector: Record<string, string>;
  timingMs: number;
}

export interface FeatureImportanceRow {
  factor: ExperimentFactorId;
  level: string;
  samples: number;
  challengeRate: number;
  successRate: number;
  avgDomCompleteness: number;
  deltaFromBaseline: number;
}

export interface ExperimentCellResult {
  cell: ExperimentCellSpec;
  fetch: RenderedFetchResult;
  analytics: ChallengeAnalytics;
  fingerprint?: FingerprintSnapshot;
  sessionScore: SessionScore;
  artifactDir?: string | null;
  experimentArtifactDir: string;
  ranAt: string;
  durationMs: number;
}

export interface ExperimentBatchResult {
  batchId: string;
  retailerId: RetailerId;
  presetId?: string;
  targetUrl: string;
  baseline: ExperimentBaseline;
  startedAt: string;
  completedAt: string;
  sharedIdentity?: TransportIdentity;
  sharedCoherence?: CoherenceResult;
  cells: ExperimentCellResult[];
  comparison: {
    baseline?: ExperimentCellResult;
    challenged: ExperimentCellResult[];
    successful: ExperimentCellResult[];
    featureImportance: FeatureImportanceRow[];
    fingerprintDiffs: FingerprintDiffEntry[];
    challengeFrequency: number;
  };
  artifactRoot: string;
}

/** Extended fingerprint probe fields (timing/storage) — collected in experiment runs. */
export interface ExtendedFingerprint extends RealismSignals {
  cookieEnabled: boolean;
  localStorageAvailable: boolean;
  sessionStorageAvailable: boolean;
  performanceNow: number;
  dateOffsetMs: number;
}

export function classificationFromResult(r: RenderedFetchResult): ResponseClassification {
  return r.classification;
}

export function lifecycleFromResult(r: RenderedFetchResult): NavigationLifecycle | undefined {
  return r.lifecycle;
}
