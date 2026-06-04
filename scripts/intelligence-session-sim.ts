#!/usr/bin/env tsx
/**
 * End-to-end production simulation — realistic sessions + failure modes.
 *
 *   npm run demo:intelligence-session-sim
 *   BASE_URL=http://localhost:3000 npm run demo:intelligence-session-sim
 */
import { performance } from "node:perf_hooks";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

interface StepResult {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

async function step(name: string, fn: () => Promise<{ ok: boolean; detail: string }>): Promise<StepResult> {
  const t0 = performance.now();
  try {
    const { ok, detail } = await fn();
    return { name, ok, ms: performance.now() - t0, detail };
  } catch (e) {
    return { name, ok: false, ms: performance.now() - t0, detail: String(e) };
  }
}

async function fetchJson(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { ...init, cache: "no-store" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { res, json };
}

async function main() {
  console.log(`\n=== Intelligence session simulation → ${BASE} ===\n`);
  const results: StepResult[] = [];

  results.push(
    await step("verify_build_imports", async () => {
      const { spawnSync } = await import("node:child_process");
      const r = spawnSync("node", ["scripts/verify-build-imports.mjs"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return {
        ok: r.status === 0,
        detail: r.status === 0 ? "typecheck + critical modules ok" : (r.stderr || r.stdout || "").slice(0, 200),
      };
    }),
  );

  results.push(
    await step("deploy_verify_local", async () => {
      const { runDeployVerification } = await import(
        "../src/lib/commerce-intelligence/ops/deploy-verify"
      );
      const report = runDeployVerification();
      return { ok: report.ready, detail: `ready=${report.ready} alerts=${report.alerts.length}` };
    }),
  );

  results.push(
    await step("health_endpoint", async () => {
      const { res, json } = await fetchJson("/api/intelligence/v1/health");
      const body = json as { ok?: boolean };
      return { ok: res.ok && body.ok !== false, detail: `status ${res.status}` };
    }),
  );

  results.push(
    await step("happy_path_recommend", async () => {
      const { res, json } = await fetchJson("/api/intelligence/v1/recommend?q=Keurig%20coffee");
      const body = json as { matched?: boolean; explanation?: unknown };
      return {
        ok: res.ok && (body.matched === true || body.matched === false),
        detail: body.matched ? "matched" : "no match (ok)",
      };
    }),
  );

  results.push(
    await step("ambiguous_query_recovery", async () => {
      const { res, json } = await fetchJson(
        "/api/intelligence/v1/recommend?q=asdfghjkl_random_query_xyz",
      );
      const body = json as { matched?: boolean };
      return { ok: res.ok && body.matched === false, detail: "graceful no-match" };
    }),
  );

  results.push(
    await step("concurrent_recommend_latency", async () => {
      const paths = Array.from({ length: 8 }, () => "/api/intelligence/v1/recommend?q=coffee");
      const t0 = performance.now();
      const settled = await Promise.all(paths.map((p) => fetchJson(p)));
      const ms = performance.now() - t0;
      const ok = settled.filter((s) => s.res.ok).length;
      return { ok: ok >= 6, detail: `${ok}/8 ok in ${ms.toFixed(0)}ms` };
    }),
  );

  results.push(
    await step("deterministic_core_offline", async () => {
      const { intelligenceRecommend } = await import(
        "../src/lib/commerce-intelligence/service/intelligence-api"
      );
      const r = intelligenceRecommend("Nike shirt", { query: "Nike shirt" });
      return { ok: true, detail: r.matched ? "graph match" : "no match" };
    }),
  );

  results.push(
    await step("ingest_stress_suite", async () => {
      const { runIngestStressSuite } = await import(
        "../src/lib/commerce-intelligence/eval/ingest-stress"
      );
      const report = runIngestStressSuite();
      return {
        ok: report.passed === report.total,
        detail: `${report.passed}/${report.total}`,
      };
    }),
  );

  results.push(
    await step("provider_safe_mode_flag", async () => {
      const { launchFlags } = await import("../src/lib/commerce-intelligence/ops/feature-flags");
      return {
        ok: true,
        detail: `safeMode=${launchFlags.safeMode} skipUngrounded=${launchFlags.skipUngroundedLlm}`,
      };
    }),
  );

  results.push(
    await step("stale_data_maintenance", async () => {
      const { runIntelligenceMaintenance } = await import(
        "../src/lib/commerce-intelligence/ops/maintenance"
      );
      const m = runIntelligenceMaintenance("manual", { skipSnapshots: true });
      return {
        ok: Boolean(m.observability),
        detail: `memory ${m.memoryCompaction.beforeCount}→${m.memoryCompaction.afterCount}`,
      };
    }),
  );

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.name} (${r.ms.toFixed(0)}ms) — ${r.detail}`);
  }

  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
