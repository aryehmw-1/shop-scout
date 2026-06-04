import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { recordSnapshotsForGraphs } from "../drift/analyze";
import { recordLongitudinalMemoryFromSnapshots } from "../longitudinal/profiles";
import { compactStructuredMemory } from "../memory/compact";
import { buildLifecycleReport } from "../lifecycle/tracking";
import { buildIntelligenceObservabilitySnapshot } from "./observability";
import { intelligenceOpsConfig } from "./config";
import { persistInferenceMetrics } from "@/lib/ai/router/metrics-persist";
import { compactAllSnapshotHistories } from "../drift/snapshots";
import { intelligenceGraphDir } from "../storage-root";

export type MaintenanceSource = "ingest" | "eval" | "cron" | "manual";

export interface IntelligenceMaintenanceResult {
  at: string;
  source: MaintenanceSource;
  snapshotsRecorded: number;
  snapshotsCompacted: ReturnType<typeof compactAllSnapshotHistories>;
  memoryCompaction: ReturnType<typeof compactStructuredMemory>;
  lifecycle: ReturnType<typeof buildLifecycleReport>;
  observability: ReturnType<typeof buildIntelligenceObservabilitySnapshot>;
}

const OPS_SNAPSHOT_PATH = join(intelligenceGraphDir(), "ops-snapshot.json");

/**
 * Scheduled learning: snapshots → longitudinal memory → compaction → lifecycle → observability.
 */
export function runIntelligenceMaintenance(
  source: MaintenanceSource,
  opts?: { skipSnapshots?: boolean },
): IntelligenceMaintenanceResult {
  if (!intelligenceOpsConfig.maintenanceEnabled) {
    const observability = buildIntelligenceObservabilitySnapshot();
    return {
      at: new Date().toISOString(),
      source,
      snapshotsRecorded: 0,
      snapshotsCompacted: { files: 0, trimmed: 0 },
      memoryCompaction: { beforeCount: 0, afterCount: 0, prunedExpired: 0, cappedLayers: {} },
      lifecycle: {
        evaluatedAt: new Date().toISOString(),
        entries: [],
        retailerReliabilityDelta: [],
        marketRegimeNote: "Maintenance disabled",
      },
      observability,
    };
  }

  const snapshotsRecorded =
    opts?.skipSnapshots ? 0 : recordSnapshotsForGraphs().length;

  const snapshotsCompacted = compactAllSnapshotHistories();
  recordLongitudinalMemoryFromSnapshots();
  const memoryCompaction = compactStructuredMemory();
  const lifecycle = buildLifecycleReport();
  persistInferenceMetrics();
  const observability = buildIntelligenceObservabilitySnapshot();

  const result: IntelligenceMaintenanceResult = {
    at: new Date().toISOString(),
    source,
    snapshotsRecorded,
    snapshotsCompacted,
    memoryCompaction,
    lifecycle,
    observability,
  };

  mkdirSync(intelligenceGraphDir(), { recursive: true });
  writeFileSync(OPS_SNAPSHOT_PATH, JSON.stringify(result, null, 2));

  return result;
}
