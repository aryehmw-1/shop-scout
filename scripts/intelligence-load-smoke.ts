#!/usr/bin/env tsx
/**
 * Lightweight load / scalability smoke test (local).
 *
 *   npx tsx scripts/intelligence-load-smoke.ts
 *   BASE_URL=http://localhost:3000 npx tsx scripts/intelligence-load-smoke.ts
 */
import { performance } from "node:perf_hooks";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 10);
const ROUNDS = Number(process.env.LOAD_ROUNDS ?? 5);

async function hit(path: string): Promise<{ ok: boolean; ms: number; status: number }> {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    return { ok: res.ok, ms: performance.now() - start, status: res.status };
  } catch {
    return { ok: false, ms: performance.now() - start, status: 0 };
  }
}

async function runBatch(paths: string[]) {
  const results = await Promise.all(paths.map((p) => hit(p)));
  const ms = results.map((r) => r.ms);
  const ok = results.filter((r) => r.ok).length;
  return {
    ok,
    total: results.length,
    p50: ms.sort((a, b) => a - b)[Math.floor(ms.length / 2)] ?? 0,
    max: Math.max(...ms, 0),
  };
}

async function main() {
  console.log(`Load smoke → ${BASE} (${CONCURRENCY} concurrent × ${ROUNDS} rounds)\n`);

  const paths = [
    "/api/intelligence/v1/health",
    "/api/intelligence/v1/recommend?q=coffee",
    "/api/intelligence/v1/drift",
  ];

  for (let r = 0; r < ROUNDS; r++) {
    const batch = Array.from({ length: CONCURRENCY }, () => paths[r % paths.length]!);
    const summary = await runBatch(batch);
    console.log(
      `Round ${r + 1}: ${summary.ok}/${summary.total} ok · p50 ${summary.p50.toFixed(0)}ms · max ${summary.max.toFixed(0)}ms`,
    );
  }

  const { runFullIntelligenceEval } = await import(
    "../src/lib/commerce-intelligence/eval/run-full-eval"
  );
  const t0 = performance.now();
  const report = runFullIntelligenceEval();
  const evalMs = performance.now() - t0;
  console.log(
    `\nEval runtime: ${evalMs.toFixed(0)}ms · gates ${report.regressionGates.passed ? "PASS" : "FAIL"} · quality pending`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
