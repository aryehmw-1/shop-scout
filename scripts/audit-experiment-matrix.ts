/**
 * Experiment matrix runner CLI — one-factor-at-a-time anti-bot experiments.
 *
 * Usage:
 *   npm run audit:experiment-matrix -- --preset=walmart-challenge-factors
 *   npm run audit:experiment-matrix -- --preset=walmart-warmup-focus --retailer=walmart
 *   RENDERED_LAB_LOG=1 npm run audit:experiment-matrix -- --preset=walmart-warmup-focus
 */
import { loadEnv } from "./load-env.mjs";

loadEnv({ verbose: true });
process.env.RENDERED_LAB_LOG = process.env.RENDERED_LAB_LOG ?? "1";

import {
  buildBatchFromPreset,
  runExperimentBatch,
} from "../src/lib/retailers/experiments/matrix-runner";
import { listExperimentPresets } from "../src/lib/retailers/experiments/factor-registry";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

async function main() {
  const presetId = arg("preset") ?? "walmart-warmup-focus";
  const url = arg("url");
  const list = process.argv.includes("--list-presets");

  if (list) {
    console.log("=== experiment presets ===");
    console.table(
      listExperimentPresets().map((p) => ({
        id: p.id,
        retailer: p.retailerId,
        label: p.label,
        factors: Object.keys(p.factorLevels).join(", "),
      })),
    );
    return;
  }

  console.log("=== experiment matrix runner ===");
  console.log({ presetId, url: url ?? "(preset default)" });

  const spec = buildBatchFromPreset(presetId, url);
  console.log({
    retailer: spec.retailerId,
    cells: spec.cells.length,
    cooldownMs: spec.cooldownMs,
    baseline: spec.baseline,
  });

  const result = await runExperimentBatch(spec);

  console.log("\n=== batch complete ===");
  console.log({
    batchId: result.batchId,
    artifactRoot: result.artifactRoot,
    challengeFrequency: result.comparison.challengeFrequency,
    sharedIdentity: result.sharedIdentity
      ? { geo: result.sharedIdentity.country, ip: result.sharedIdentity.ip, ok: result.sharedIdentity.ok }
      : "(probe failed)",
  });

  console.log("\n=== cell outcomes ===");
  console.table(
    result.cells.map((c) => ({
      cell: c.cell.id,
      factor: c.cell.factor,
      failureKind: c.sessionScore.failureKind,
      challenged: c.sessionScore.challenged,
      challengeType: c.analytics.challengeType,
      vendor: c.analytics.vendor ?? "-",
      domCompleteness: c.analytics.domCompleteness,
      extractionConfidence: c.sessionScore.extractionConfidence,
      ms: c.durationMs,
    })),
  );

  console.log("\n=== feature importance (delta vs baseline challenge rate) ===");
  console.table(result.comparison.featureImportance);

  if (result.comparison.fingerprintDiffs.length) {
    console.log("\n=== fingerprint diff (success vs challenged) ===");
    console.table(result.comparison.fingerprintDiffs);
  }

  console.log(`\nView batch: /debug/experiments?batch=${result.batchId}`);
}

main().catch((e) => {
  console.error("[audit:experiment-matrix] failed", e);
  process.exit(1);
});
