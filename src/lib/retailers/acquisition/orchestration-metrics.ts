/**
 * Durable orchestration metrics (append-only JSONL under artifacts/ops/).
 * Survives process restart unlike in-memory strategy-metrics.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RetailerId } from "../../types";
import type { AcquisitionMethod, AcquisitionFailureKind } from "./types";
import type { TransportClass } from "./transport-policy";

const OPS_ROOT = join(process.cwd(), "artifacts", "ops");
const METRICS_FILE = join(OPS_ROOT, "orchestration-metrics.jsonl");

export interface OrchestrationMetricEvent {
  ts: string;
  retailerId: RetailerId;
  method: AcquisitionMethod;
  transport?: TransportClass;
  ok: boolean;
  failureKind?: AcquisitionFailureKind | string;
  latencyMs: number;
  costScore: number;
  extractionConfidence: number;
  fromCache?: boolean;
  escalated?: boolean;
}

export async function recordOrchestrationEvent(event: Omit<OrchestrationMetricEvent, "ts">): Promise<void> {
  await mkdir(OPS_ROOT, { recursive: true });
  const row: OrchestrationMetricEvent = { ...event, ts: new Date().toISOString() };
  await appendFile(METRICS_FILE, `${JSON.stringify(row)}\n`, "utf8");
}

export interface OrchestrationMetricsSummary {
  totalEvents: number;
  residentialUsagePct: number;
  avgCostPerSuccess: number;
  challengeRateByTransport: Record<string, number>;
  fallbackFrequency: number;
  retailerReliability: Array<{
    retailerId: RetailerId;
    attempts: number;
    successRate: number;
    avgConfidence: number;
    avgCost: number;
  }>;
}

export async function summarizeOrchestrationMetrics(limit = 5000): Promise<OrchestrationMetricsSummary> {
  if (!existsSync(METRICS_FILE)) {
    return {
      totalEvents: 0,
      residentialUsagePct: 0,
      avgCostPerSuccess: 0,
      challengeRateByTransport: {},
      fallbackFrequency: 0,
      retailerReliability: [],
    };
  }
  const raw = await readFile(METRICS_FILE, "utf8");
  const events = raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .map((l) => JSON.parse(l) as OrchestrationMetricEvent);

  const residential = events.filter((e) => e.transport === "residential").length;
  const successes = events.filter((e) => e.ok);
  const avgCostPerSuccess =
    successes.length ?
      successes.reduce((s, e) => s + e.costScore, 0) / successes.length
    : 0;

  const byTransport = new Map<string, { total: number; fail: number }>();
  for (const e of events) {
    const t = e.transport ?? "direct";
    const row = byTransport.get(t) ?? { total: 0, fail: 0 };
    row.total += 1;
    if (!e.ok) row.fail += 1;
    byTransport.set(t, row);
  }
  const challengeRateByTransport: Record<string, number> = {};
  for (const [t, row] of byTransport) {
    challengeRateByTransport[t] = row.total ? Math.round((row.fail / row.total) * 1000) / 1000 : 0;
  }

  const byRetailer = new Map<
    string,
    { attempts: number; ok: number; conf: number; cost: number }
  >();
  for (const e of events) {
    const row = byRetailer.get(e.retailerId) ?? { attempts: 0, ok: 0, conf: 0, cost: 0 };
    row.attempts += 1;
    if (e.ok) row.ok += 1;
    row.conf += e.extractionConfidence;
    row.cost += e.costScore;
    byRetailer.set(e.retailerId, row);
  }

  return {
    totalEvents: events.length,
    residentialUsagePct: events.length ? Math.round((residential / events.length) * 1000) / 1000 : 0,
    avgCostPerSuccess: Math.round(avgCostPerSuccess * 1000) / 1000,
    challengeRateByTransport,
    fallbackFrequency: events.filter((e) => e.escalated).length / Math.max(events.length, 1),
    retailerReliability: [...byRetailer.entries()].map(([retailerId, row]) => ({
      retailerId: retailerId as RetailerId,
      attempts: row.attempts,
      successRate: Math.round((row.ok / row.attempts) * 1000) / 1000,
      avgConfidence: Math.round((row.conf / row.attempts) * 1000) / 1000,
      avgCost: Math.round((row.cost / row.attempts) * 1000) / 1000,
    })),
  };
}
