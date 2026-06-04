import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getInferenceMetricsSummary } from "@/lib/ai/router/instrumentation";
import { loadPersistedInferenceMetrics } from "@/lib/ai/router/metrics-persist";
import { getCircuitBreakerStatus } from "@/lib/ai/router/resilience";
import { loadAllGraphs } from "../graph/store";
import { loadEvalHistory } from "../eval/history";
import { analyticsSummary } from "../analytics/events";
import { buildRetailerIntelligenceProfiles } from "../reputation/retailer-intelligence";
import type { CalibrationReport } from "../eval/calibration";
import type { DriftReport } from "../drift/analyze";
import type { RegressionGateReport } from "../eval/regression-gates";
import type { AdversarialSuiteReport } from "../eval/adversarial-cases";

const GRAPH_DIR = join(process.cwd(), "data", "intelligence-graph");

function readJson<T>(name: string): T | null {
  const p = join(GRAPH_DIR, name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

export interface IntelligenceObservabilitySnapshot {
  at: string;
  graphCount: number;
  confidenceDistribution: { high: number; medium: number; low: number };
  drift: DriftReport | null;
  calibration: CalibrationReport | null;
  regressionGates: RegressionGateReport | null;
  adversarial: AdversarialSuiteReport | null;
  evalHistory: ReturnType<typeof loadEvalHistory>;
  retailerVolatility: Array<{
    retailer: string;
    trustScore: number;
    pricingVolatility: number;
    disagreementFrequency: number;
  }>;
  inference: ReturnType<typeof getInferenceMetricsSummary> & {
    persisted: ReturnType<typeof loadPersistedInferenceMetrics>;
    costPerRecommendationUsd: number | null;
    escalationMarginalValue: number | null;
  };
  circuitBreakers: ReturnType<typeof getCircuitBreakerStatus>;
  anomalyFrequency: {
    falsePositives: number;
    calibrationAnomalies: number;
    volatileCanonicals: number;
  };
  productAnalytics: ReturnType<typeof analyticsSummary>;
}

export function buildIntelligenceObservabilitySnapshot(): IntelligenceObservabilitySnapshot {
  const graphs = loadAllGraphs();
  const dist = { high: 0, medium: 0, low: 0 };
  for (const g of graphs) {
    const s = g.identity_confidence.overall;
    if (s >= 0.72) dist.high++;
    else if (s >= 0.52) dist.medium++;
    else dist.low++;
  }

  const calibration = readJson<CalibrationReport>("calibration-report.json");
  const drift = readJson<DriftReport>("drift-report.json");
  const regressionGates = readJson<RegressionGateReport>("regression-gates.json");
  const adversarial = readJson<AdversarialSuiteReport>("adversarial-suite-report.json");

  const live = getInferenceMetricsSummary();
  const persisted = loadPersistedInferenceMetrics();

  const recCalls = persisted.recommendationCalls || live.totalCalls;
  const costPerRec =
    recCalls > 0 ?
      Math.round((persisted.totalEstimatedUsd + live.totalEstimatedUsd) * 10000) / 10000 / recCalls
    : null;

  const esc = persisted.escalationOutcomes;
  const escalationMarginalValue =
    esc && esc.escalated > 0 ?
      Math.round((esc.helped / esc.escalated) * 1000) / 1000
    : null;

  const retailers = buildRetailerIntelligenceProfiles();

  return {
    at: new Date().toISOString(),
    graphCount: graphs.length,
    confidenceDistribution: dist,
    drift,
    calibration,
    regressionGates,
    adversarial,
    evalHistory: loadEvalHistory(),
    retailerVolatility: retailers.map((r) => ({
      retailer: r.retailer,
      trustScore: r.trustScore,
      pricingVolatility: r.pricingVolatility,
      disagreementFrequency: r.disagreementFrequency,
    })),
    inference: {
      ...live,
      persisted,
      costPerRecommendationUsd: costPerRec,
      escalationMarginalValue,
    },
    circuitBreakers: getCircuitBreakerStatus(),
    anomalyFrequency: {
      falsePositives: calibration?.falsePositiveSignals.length ?? 0,
      calibrationAnomalies: calibration?.offerAnomalies?.length ?? 0,
      volatileCanonicals: drift?.volatileCanonicals.length ?? 0,
    },
    productAnalytics: analyticsSummary(),
  };
}
