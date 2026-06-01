/**
 * Session scoring + feature importance for experiment batches.
 */
import type {
  ExperimentCellResult,
  FeatureImportanceRow,
  SessionScore,
  ExperimentFactorId,
} from "./types";
import type { ExperimentBaseline } from "./types";
import { baselineToFactorVector } from "./factor-registry";

export function scoreSession(
  cellId: string,
  result: ExperimentCellResult["fetch"],
  factorVector: Record<string, string>,
): SessionScore {
  const domBytes = result.lifecycle?.domBytesAtExtraction ?? result.classification.bytes ?? 0;
  const extractionConfidence = Math.min(
    1,
    (domBytes / 1500) * (result.classification.ok ? 1 : 0.3) * (result.coherence?.score ?? 1),
  );

  return {
    sessionId: cellId,
    cellId,
    challenged:
      !result.classification.ok ||
      result.classification.category === "captcha" ||
      result.failureKind === "walmart_challenge",
    challengeProbability: result.challenge?.score,
    botSuspicion: result.suspicion?.score,
    failureKind: result.failureKind ?? "unknown",
    extractionConfidence: Math.round(extractionConfidence * 1000) / 1000,
    factorVector,
    timingMs: result.timingMs,
  };
}

export function computeFeatureImportance(
  results: ExperimentCellResult[],
  baseline: ExperimentBaseline,
): FeatureImportanceRow[] {
  const baseCell = results.find((r) => r.cell.isBaseline);
  const baseChallengeRate = baseCell
    ? baseCell.sessionScore.challenged ? 1 : 0
    : results.filter((r) => r.sessionScore.challenged).length / Math.max(results.length, 1);

  const byFactor = new Map<string, ExperimentCellResult[]>();
  for (const r of results) {
    if (r.cell.isBaseline) continue;
    const k = `${r.cell.factor}=${r.cell.factorValue}`;
    const arr = byFactor.get(k) ?? [];
    arr.push(r);
    byFactor.set(k, arr);
  }

  const rows: FeatureImportanceRow[] = [];
  for (const [key, cells] of byFactor.entries()) {
    const [factor, level] = key.split("=") as [ExperimentFactorId, string];
    const challenged = cells.filter((c) => c.sessionScore.challenged).length;
    const ok = cells.filter((c) => c.fetch.classification.ok).length;
    const challengeRate = challenged / cells.length;
    const avgDom =
      cells.reduce((s, c) => s + c.analytics.domCompleteness, 0) / cells.length;
    rows.push({
      factor,
      level,
      samples: cells.length,
      challengeRate: Math.round(challengeRate * 1000) / 1000,
      successRate: Math.round((ok / cells.length) * 1000) / 1000,
      avgDomCompleteness: Math.round(avgDom * 1000) / 1000,
      deltaFromBaseline: Math.round((challengeRate - baseChallengeRate) * 1000) / 1000,
    });
  }

  return rows.sort((a, b) => Math.abs(b.deltaFromBaseline) - Math.abs(a.deltaFromBaseline));
}

export function factorVectorFromCell(
  baseline: ExperimentBaseline,
  cellOverrides: ExperimentBaseline,
): Record<string, string> {
  return baselineToFactorVector({ ...baseline, ...cellOverrides });
}
