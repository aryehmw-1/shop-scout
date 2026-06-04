import type { AIProviderId } from "../providers/types";
import type { RoutePlan } from "./types";

export interface InferenceMetricEntry {
  at: string;
  provider: AIProviderId;
  model: string;
  workload: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  escalated: boolean;
  cacheHit: boolean;
}

const buffer: InferenceMetricEntry[] = [];
const MAX_BUFFER = 500;

/** Rough USD estimates per 1M tokens (configurable). */
const COST_PER_M: Partial<Record<string, { in: number; out: number }>> = {
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "claude-3-5-haiku-latest": { in: 0.8, out: 4 },
  "gemini-2.0-flash": { in: 0.1, out: 0.4 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = COST_PER_M[model] ?? { in: 1, out: 3 };
  return (
    (inputTokens / 1_000_000) * rates.in +
    (outputTokens / 1_000_000) * rates.out
  );
}

export function recordInferenceMetric(entry: Omit<InferenceMetricEntry, "at" | "estimatedCostUsd"> & {
  estimatedCostUsd?: number;
}): void {
  buffer.unshift({
    ...entry,
    at: new Date().toISOString(),
    estimatedCostUsd:
      entry.estimatedCostUsd ??
      estimateCostUsd(entry.model, entry.inputTokens, entry.outputTokens),
  });
  if (buffer.length > MAX_BUFFER) buffer.length = MAX_BUFFER;
}

export function getInferenceMetricsSummary(): {
  totalCalls: number;
  totalEstimatedUsd: number;
  cacheHitRate: number;
  escalationRate: number;
  byProvider: Record<string, number>;
  recent: InferenceMetricEntry[];
} {
  const total = buffer.length;
  const cacheHits = buffer.filter((b) => b.cacheHit).length;
  const escalated = buffer.filter((b) => b.escalated).length;
  const byProvider: Record<string, number> = {};
  let usd = 0;
  for (const b of buffer) {
    byProvider[b.provider] = (byProvider[b.provider] ?? 0) + 1;
    usd += b.estimatedCostUsd;
  }
  return {
    totalCalls: total,
    totalEstimatedUsd: Math.round(usd * 10000) / 10000,
    cacheHitRate: total ? cacheHits / total : 0,
    escalationRate: total ? escalated / total : 0,
    byProvider,
    recent: buffer.slice(0, 20),
  };
}

export function logRouteDecision(plan: RoutePlan, escalated: boolean): void {
  if (process.env.AI_ROUTER_DEBUG !== "1") return;
  console.info("[ai-router]", { workload: plan.workload, provider: plan.provider, model: plan.model, escalated });
}
