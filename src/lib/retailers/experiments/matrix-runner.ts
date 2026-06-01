/**
 * Experiment matrix runner — sequential, one browser per cell, full telemetry.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RetailerId } from "../../types";
// import { fetchRenderedHtml } from "../../offers/retailer-adapters/rendered-fetch";
import { newStickySessionId } from "../../net/proxy-routing";
import { labLog, COMPARE_VARIANT_COOLDOWN_MS } from "../rendered-lab";
import { sleep } from "../session-behavior";
import type {
  ExperimentBatchResult,
  ExperimentBatchSpec,
  ExperimentCellResult,
  ExperimentBaseline,
} from "./types";
import { stubRenderedFetchDisabled } from "./types";
import {
  buildOneAtATimeMatrix,
  getExperimentPreset,
  baselineToFactorVector,
} from "./factor-registry";
import { buildChallengeAnalytics, challengeFrequencyOverBatch } from "./challenge-analytics";
import { snapshotFromSignals, diffFingerprints } from "./fingerprint-diff";
import { scoreSession, computeFeatureImportance, factorVectorFromCell } from "./session-scoring";
import { saveExperimentBatch, EXPERIMENT_ROOT } from "./experiment-store";

function parseViewport(v?: string): { width: number; height: number } | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d+)x(\d+)$/i);
  if (!m) return undefined;
  return { width: parseInt(m[1]!, 10), height: parseInt(m[2]!, 10) };
}

function baselineToFetchOptions(
  baseline: ExperimentBaseline,
  cell: ExperimentBaseline,
  stickySessionId?: string,
) {
  const merged = { ...baseline, ...cell };
  return {
    transport: merged.transport,
    behaviorId: merged.behavior,
    warmup: merged.warmup,
    waitStrategy: merged.waitStrategy,
    blockResources: merged.blockResources,
    earlyExtraction: merged.earlyExtraction,
    stickySessionId: merged.sticky ? stickySessionId : undefined,
    country: merged.geoCountry ?? merged.country,
    region: merged.region,
    viewport: merged.viewport,
    sessionPersistence: merged.sessionPersistence,
    probeIdentity: true,
    alwaysCapture: true,
  };
}

export function buildBatchFromPreset(presetId: string, targetUrl?: string): ExperimentBatchSpec {
  const preset = getExperimentPreset(presetId);
  if (!preset) throw new Error(`Unknown experiment preset: ${presetId}`);
  const cells = buildOneAtATimeMatrix(preset);
  return {
    presetId,
    retailerId: preset.retailerId,
    targetUrl: targetUrl ?? preset.targetUrl ?? "",
    baseline: preset.baseline,
    cells,
    cooldownMs: COMPARE_VARIANT_COOLDOWN_MS,
    probeIdentityOnce: false,
  };
}

export async function runExperimentBatch(spec: ExperimentBatchSpec): Promise<ExperimentBatchResult> {
  const batchId = new Date().toISOString().replace(/[:.]/g, "-");
  const startedAt = new Date().toISOString();
  const stickySessionId = spec.baseline.sticky ? newStickySessionId() : undefined;
  const cooldownMs = spec.cooldownMs ?? COMPARE_VARIANT_COOLDOWN_MS;
  const cells: ExperimentCellResult[] = [];

  labLog("experiment_batch_start", {
    batchId,
    presetId: spec.presetId,
    cellCount: spec.cells.length,
    cooldownMs,
  });

  for (let i = 0; i < spec.cells.length; i++) {
    const cellSpec = spec.cells[i]!;
    if (i > 0) {
      labLog("experiment_cooldown", { ms: cooldownMs, before: cellSpec.id });
      await sleep(cooldownMs);
    }

    const cellStarted = Date.now();
    labLog("experiment_cell_start", { cellId: cellSpec.id, factor: cellSpec.factor });

    // const fetch = await fetchRenderedHtml(
    //   spec.targetUrl,
    //   spec.retailerId as RetailerId,
    //   baselineToFetchOptions(spec.baseline, cellSpec.overrides, stickySessionId),
    // );
    const fetch = stubRenderedFetchDisabled();

    let harContent: string | undefined;
    if (fetch.artifactDir) {
      try {
        harContent = await readFile(join(fetch.artifactDir, "network.har"), "utf8");
      } catch {
        /* no har */
      }
    }

    const analytics = buildChallengeAnalytics(fetch, harContent);
    const factorVector = factorVectorFromCell(spec.baseline, cellSpec.overrides);
    const sessionScore = scoreSession(cellSpec.id, fetch, factorVector);
    const fingerprint = fetch.realism
      ? snapshotFromSignals(fetch.realism, fetch.coherence?.score)
      : undefined;

    const experimentArtifactDir = join(EXPERIMENT_ROOT, batchId, "cells", cellSpec.id);

    cells.push({
      cell: cellSpec,
      fetch,
      analytics,
      fingerprint,
      sessionScore,
      artifactDir: fetch.artifactDir,
      experimentArtifactDir,
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - cellStarted,
    });

    labLog("experiment_cell_done", {
      cellId: cellSpec.id,
      failureKind: fetch.failureKind,
      challenged: analytics.challenged,
      challengeType: analytics.challengeType,
    });
  }

  const baselineCell = cells.find((c) => c.cell.isBaseline);
  const challenged = cells.filter((c) => c.analytics.challenged);
  const successful = cells.filter((c) => !c.analytics.challenged && c.analytics.extractionSuccess);
  const featureImportance = computeFeatureImportance(cells, spec.baseline);
  const fingerprintDiffs = diffFingerprints(
    successful[0]?.fingerprint ?? baselineCell?.fingerprint,
    challenged[0]?.fingerprint,
  );

  const result: ExperimentBatchResult = {
    batchId,
    retailerId: spec.retailerId as RetailerId,
    presetId: spec.presetId,
    targetUrl: spec.targetUrl,
    baseline: spec.baseline,
    startedAt,
    completedAt: new Date().toISOString(),
    sharedIdentity: cells[0]?.fetch.identity,
    sharedCoherence: cells[0]?.fetch.coherence,
    cells,
    comparison: {
      baseline: baselineCell,
      challenged,
      successful,
      featureImportance,
      fingerprintDiffs,
      challengeFrequency: challengeFrequencyOverBatch(cells),
    },
    artifactRoot: join(EXPERIMENT_ROOT, batchId),
  };

  await saveExperimentBatch(result);
  labLog("experiment_batch_complete", {
    batchId,
    challengeFrequency: result.comparison.challengeFrequency,
  });
  return result;
}
