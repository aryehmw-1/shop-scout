import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getInferenceMetricsSummary, type InferenceMetricEntry } from "./instrumentation";

export interface PersistedInferenceMetrics {
  version: 1;
  updatedAt: string;
  totalEstimatedUsd: number;
  recommendationCalls: number;
  escalationOutcomes: { escalated: number; helped: number; wasted: number };
  recent: InferenceMetricEntry[];
}

const PATH = join(process.cwd(), "data", "intelligence-graph", "inference-metrics.json");

let escalationOutcomes = { escalated: 0, helped: 0, wasted: 0 };
let recommendationCalls = 0;

export function recordRecommendationCall(): void {
  recommendationCalls++;
}

export function recordEscalationOutcome(helped: boolean): void {
  escalationOutcomes.escalated++;
  if (helped) escalationOutcomes.helped++;
  else escalationOutcomes.wasted++;
}

export function loadPersistedInferenceMetrics(): PersistedInferenceMetrics {
  if (!existsSync(PATH)) {
    return {
      version: 1,
      updatedAt: new Date(0).toISOString(),
      totalEstimatedUsd: 0,
      recommendationCalls: 0,
      escalationOutcomes: { escalated: 0, helped: 0, wasted: 0 },
      recent: [],
    };
  }
  try {
    return JSON.parse(readFileSync(PATH, "utf8")) as PersistedInferenceMetrics;
  } catch {
    return {
      version: 1,
      updatedAt: new Date(0).toISOString(),
      totalEstimatedUsd: 0,
      recommendationCalls: 0,
      escalationOutcomes: { escalated: 0, helped: 0, wasted: 0 },
      recent: [],
    };
  }
}

export function persistInferenceMetrics(): void {
  const live = getInferenceMetricsSummary();
  const prev = loadPersistedInferenceMetrics();

  const file: PersistedInferenceMetrics = {
    version: 1,
    updatedAt: new Date().toISOString(),
    totalEstimatedUsd: prev.totalEstimatedUsd + live.totalEstimatedUsd,
    recommendationCalls: prev.recommendationCalls + recommendationCalls,
    escalationOutcomes: {
      escalated: prev.escalationOutcomes.escalated + escalationOutcomes.escalated,
      helped: prev.escalationOutcomes.helped + escalationOutcomes.helped,
      wasted: prev.escalationOutcomes.wasted + escalationOutcomes.wasted,
    },
    recent: [...live.recent, ...prev.recent].slice(0, 50),
  };

  mkdirSync(join(process.cwd(), "data", "intelligence-graph"), { recursive: true });
  writeFileSync(PATH, JSON.stringify(file, null, 2));

  recommendationCalls = 0;
  escalationOutcomes = { escalated: 0, helped: 0, wasted: 0 };
}
