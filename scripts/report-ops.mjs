/**
 * Operational snapshot reporter.
 *
 * Compiles the control-center debug endpoints + local proxy config into a
 * single timestamped JSON + Markdown report under artifacts/ops-reports/.
 *
 * Usage:
 *   npm run report:ops                       # defaults to http://localhost:3000
 *   npm run report:ops http://127.0.0.1:3000
 *
 * The dev/prod server must be running for endpoint data to populate; proxy
 * config + visual-audit history are read locally and work without a server.
 */
import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetch as undiciFetch } from "undici";
import { loadEnv } from "./load-env.mjs";
import { describeProxyConfig } from "./proxy-config.mjs";

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const baseUrl = (process.argv[2] || process.env.OPS_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

const ENDPOINTS = {
  brandVisual: "/api/debug/brand-visual",
  brandAuditHistory: "/api/debug/brand-audit-history",
  retailerHealth: "/api/debug/retailer-health",
  ingestionEfficiency: "/api/debug/ingestion-efficiency",
  requestBlocking: "/api/debug/request-blocking",
};

async function pull(path) {
  const start = performance.now();
  try {
    const res = await undiciFetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(15000),
      headers: { "cache-control": "no-store" },
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) return { ok: false, status: res.status, latencyMs, data: null };
    return { ok: true, status: res.status, latencyMs, data: await res.json() };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Math.round(performance.now() - start), error: String(e).slice(0, 160), data: null };
  }
}

function latestHistoryArtifact() {
  const dir = join(root, "artifacts", "brand-audit", "history");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  if (!files.length) return null;
  try {
    return { file: files[0], data: JSON.parse(readFileSync(join(dir, files[0]), "utf8")) };
  } catch {
    return { file: files[0], data: null };
  }
}

function num(v, d = "n/a") {
  return v === undefined || v === null ? d : v;
}

function buildMarkdown(report) {
  const { proxy, endpoints, timestamp, baseUrl: base } = report;
  const bv = endpoints.brandVisual.data ?? {};
  const ie = endpoints.ingestionEfficiency.data ?? {};
  const rb = endpoints.requestBlocking.data ?? {};
  const rh = endpoints.retailerHealth.data ?? {};
  const lines = [];

  lines.push(`# Operational Report`);
  lines.push("");
  lines.push(`- Generated: \`${timestamp}\``);
  lines.push(`- Base URL: \`${base}\``);
  lines.push("");

  lines.push(`## Proxy routing status`);
  lines.push("");
  lines.push(`- Enabled: \`${proxy.enabled}\``);
  lines.push(`- Configured proxies: \`${proxy.configuredCount}\``);
  lines.push(`- Chosen proxy: \`${proxy.chosenProxy}\``);
  lines.push(`- Provider: \`${proxy.provider}\` · Mode: \`${proxy.mode}\``);
  if (proxy.warnings.length) {
    lines.push(`- Warnings:`);
    for (const w of proxy.warnings) lines.push(`  - ${w}`);
  }
  lines.push("");

  lines.push(`## Endpoint reachability`);
  lines.push("");
  lines.push(`| Endpoint | OK | Status | Latency ms |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const [name, r] of Object.entries(endpoints)) {
    lines.push(`| ${name} | ${r.ok ? "✓" : "✗"} | ${r.status} | ${r.latencyMs} |`);
  }
  lines.push("");

  lines.push(`## Visual parity`);
  lines.push("");
  lines.push(`- Favicon URL: \`${num(bv.faviconUrl)}\``);
  lines.push(`- Favicon hash: \`${num(bv.faviconHash)}\` · ETag: \`${num(bv.etag)}\``);
  lines.push(`- Navbar vs favicon diff: \`${num(bv?.comparisons?.[1]?.diffPct)}%\``);
  lines.push("");

  lines.push(`## Ingestion economics`);
  lines.push("");
  lines.push(`- Nightly GB estimate: \`${num(ie?.efficiency?.totals?.nightlyGbEstimate)}\``);
  lines.push(`- Monthly GB estimate: \`${num(ie?.efficiency?.totals?.monthlyGbEstimate)}\``);
  lines.push(`- Blocked %: \`${num(rb?.totals?.blockedPct)}%\` · Est saved MB: \`${num(rb?.totals?.estimatedSavedMb)}\``);
  lines.push("");

  lines.push(`## Retailer health`);
  lines.push("");
  const retailers = rh?.retailers ?? [];
  if (retailers.length) {
    lines.push(`| Retailer | Status | Fetch % | Parser % | Bandwidth MB |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const r of retailers) {
      lines.push(
        `| ${r.retailerId} | ${num(r.status)} | ${((r.fetchSuccessRate ?? 0) * 100).toFixed(1)} | ${((r.parserSuccessRate ?? 0) * 100).toFixed(1)} | ${r.bandwidthBytes ? (r.bandwidthBytes / (1024 * 1024)).toFixed(2) : "0.00"} |`,
      );
    }
  } else {
    lines.push(`_No retailer health data (server offline or no traffic yet)._`);
  }
  lines.push("");

  return lines.join("\n") + "\n";
}

async function run() {
  const timestamp = new Date().toISOString();
  const proxy = describeProxyConfig();

  console.log("=== report:ops ===");
  console.log(`base: ${baseUrl}`);
  console.log(`proxy: enabled=${proxy.enabled} configured=${proxy.configuredCount} provider=${proxy.provider}`);
  for (const w of proxy.warnings) console.warn(`  ⚠ ${w}`);

  const endpoints = {};
  for (const [name, path] of Object.entries(ENDPOINTS)) {
    endpoints[name] = await pull(path);
    console.log(`  ${endpoints[name].ok ? "✓" : "✗"} ${name} (${endpoints[name].status}, ${endpoints[name].latencyMs}ms)`);
  }

  const reachable = Object.values(endpoints).filter((e) => e.ok).length;
  if (reachable === 0) {
    console.warn(
      `\n⚠ No debug endpoints reachable at ${baseUrl}. Start the server (npm run dev) for live ingestion/visual data. ` +
        `Proxy config + local artifacts are still captured.`,
    );
  }

  const report = {
    timestamp,
    baseUrl,
    proxy,
    endpointSummary: { reachable, total: Object.keys(ENDPOINTS).length },
    endpoints,
    latestLocalArtifact: latestHistoryArtifact(),
  };

  const outDir = join(root, "artifacts", "ops-reports");
  mkdirSync(outDir, { recursive: true });
  const runId = timestamp.replace(/[:.]/g, "-");
  const jsonPath = join(outDir, `${runId}-ops.json`);
  const mdPath = join(outDir, `${runId}-ops.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, buildMarkdown(report));

  console.log(`\nWrote:\n  ${jsonPath}\n  ${mdPath}`);
}

run().catch((e) => {
  console.error("[report:ops] failed", e);
  process.exit(1);
});
