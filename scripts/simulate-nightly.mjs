/**
 * Lightweight nightly crawl simulator.
 * Usage: npm run simulate:nightly
 */
import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { loadEnv } from "./load-env.mjs";
import { getProxyPool, describeProxyConfig } from "./proxy-config.mjs";
import { classifyRetailerResponse } from "./response-classify.mjs";
import {
  readCacheEntry,
  writeCacheEntry,
  touchCacheEntry,
  cacheDecision,
  conditionalHeaders,
} from "./fetch-cache.mjs";

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = JSON.parse(
  readFileSync(resolve(__dirname, "..", "src", "lib", "ingestion", "seed-products.json"), "utf8"),
);

const PRODUCT_LIMIT = parseInt(process.env.SIM_PRODUCTS ?? "5", 10) || 5;
const PRODUCTS = SEED.products.slice(0, PRODUCT_LIMIT).map((p) => p.query);

const RETAILER_URLS = {
  amazon: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  walmart: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`,
  target: (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`,
  kroger: (q) => `https://www.kroger.com/search?query=${encodeURIComponent(q)}`,
};
// Honor golden-path-only mode; otherwise simulate the reachable retailers.
const GOLDEN_ONLY = /^(1|true|on|yes)$/i.test(process.env.INDEX_GOLDEN_PATH_ONLY ?? "");
const GOLDEN = new Set(["amazon"]);
const RETAILERS = Object.entries(RETAILER_URLS)
  .filter(([id]) => (GOLDEN_ONLY ? GOLDEN.has(id) : ["amazon", "walmart", "target"].includes(id)))
  .map(([id, url]) => ({ id, url }));

function pickProxy(seed, attempt, pool) {
  if (!pool.length) return undefined;
  const directFirst = (process.env.INDEX_PROXY_DIRECT_FIRST ?? "1") !== "0";
  if (directFirst && attempt === 1) return undefined;
  let h = 0;
  const s = `${seed}:${attempt}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

const metrics = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  revalidated304: 0,
  bytesSavedByCache: 0,
  proxyRequests: 0,
  directRequests: 0,
  blocked: 0,
  success: 0,
  bytes: 0,
  latencyMs: 0,
  blockReasons: {},
  perRetailer: {},
};

function bumpRetailer(id, patch) {
  const row = metrics.perRetailer[id] ?? {
    requests: 0,
    success: 0,
    blocked: 0,
    bytes: 0,
    latencyMs: 0,
    proxy: 0,
    direct: 0,
  };
  Object.assign(row, {
    requests: row.requests + (patch.requests ?? 0),
    success: row.success + (patch.success ?? 0),
    blocked: row.blocked + (patch.blocked ?? 0),
    bytes: row.bytes + (patch.bytes ?? 0),
    latencyMs: row.latencyMs + (patch.latencyMs ?? 0),
    proxy: row.proxy + (patch.proxy ?? 0),
    direct: row.direct + (patch.direct ?? 0),
  });
  metrics.perRetailer[id] = row;
}

async function requestWithRetry(retailerId, url, pool) {
  // Serve from persistent cache while fresh (zero network).
  const existing = readCacheEntry(url);
  const decision = cacheDecision(existing);
  if (decision === "fresh") {
    metrics.cacheHits += 1;
    metrics.bytesSavedByCache += existing.bytes ?? 0;
    bumpRetailer(retailerId, { requests: 0 });
    return { ok: true, fromCache: "fresh", bytes: 0, viaProxy: false };
  }

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    metrics.cacheMisses += 1;
    const proxy = pickProxy(`${retailerId}:${url}`, attempt, pool);
    const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
    const started = performance.now();
    metrics.totalRequests += 1;
    if (proxy) metrics.proxyRequests += 1;
    else metrics.directRequests += 1;
    bumpRetailer(retailerId, { requests: 1, proxy: proxy ? 1 : 0, direct: proxy ? 0 : 1 });

    try {
      // When stale, revalidate cheaply with conditional headers.
      const condHeaders = decision === "revalidate" ? conditionalHeaders(existing) : {};
      const res = await undiciFetch(url, {
        dispatcher,
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...condHeaders,
        },
      });
      const latency = Math.round(performance.now() - started);
      metrics.latencyMs += latency;

      if (res.status === 304 && existing) {
        await res.body?.cancel?.().catch(() => {});
        metrics.revalidated304 += 1;
        metrics.cacheHits += 1;
        metrics.bytesSavedByCache += existing.bytes ?? 0;
        touchCacheEntry(existing);
        bumpRetailer(retailerId, { success: 1, latencyMs: latency });
        return { ok: true, fromCache: "revalidated", bytes: 0, viaProxy: Boolean(proxy) };
      }

      const html = await res.text();
      const cls = classifyRetailerResponse({
        retailerId,
        status: res.status,
        html,
        headers: res.headers,
      });
      const bytes = cls.bytes;
      metrics.bytes += bytes;
      bumpRetailer(retailerId, { bytes });

      if (!cls.ok) {
        metrics.blocked += 1;
        metrics.blockReasons[cls.reason] = (metrics.blockReasons[cls.reason] ?? 0) + 1;
        bumpRetailer(retailerId, { blocked: 1 });
        continue;
      }

      // Cache successful responses with validators for future revalidation.
      writeCacheEntry({
        url,
        body: html,
        etag: res.headers.get("etag") ?? undefined,
        lastModified: res.headers.get("last-modified") ?? undefined,
      });
      metrics.success += 1;
      bumpRetailer(retailerId, { success: 1 });
      return { ok: true, status: res.status, latency, bytes, viaProxy: Boolean(proxy) };
    } catch {
      // retry
    }
  }
  return { ok: false };
}

async function run() {
  const diag = describeProxyConfig();
  console.log("=== simulate:nightly proxy config ===");
  console.log({
    enabled: diag.enabled,
    configuredCount: diag.configuredCount,
    chosenProxy: diag.chosenProxy,
    provider: diag.provider,
    mode: diag.mode,
  });
  for (const w of diag.warnings) console.warn(`  ⚠ ${w}`);

  const pool = getProxyPool();
  for (const product of PRODUCTS) {
    for (const retailer of RETAILERS) {
      const url = retailer.url(product);
      await requestWithRetry(retailer.id, url, pool);
    }
  }

  const avgLatency = metrics.totalRequests > 0 ? Math.round(metrics.latencyMs / metrics.totalRequests) : 0;
  const avgKbPerRequest = metrics.totalRequests > 0 ? (metrics.bytes / metrics.totalRequests / 1024) : 0;
  const nightlyGb = metrics.bytes / (1024 ** 3);
  const monthlyGb = nightlyGb * 30;
  const cacheLookups = metrics.cacheHits + metrics.cacheMisses;
  const cacheHitRate = cacheLookups > 0 ? metrics.cacheHits / cacheLookups : 0;

  const summary = {
    products: PRODUCTS.length,
    retailers: RETAILERS.length,
    proxy: {
      enabled: diag.enabled,
      configuredCount: diag.configuredCount,
      provider: diag.provider,
      mode: diag.mode,
    },
    ...metrics,
    avgLatencyMs: avgLatency,
    avgKbPerRequest: Math.round(avgKbPerRequest * 100) / 100,
    cacheHitRate: Math.round(cacheHitRate * 1000) / 1000,
    cacheSavedKb: Math.round((metrics.bytesSavedByCache / 1024) * 100) / 100,
    nightlyGbEstimate: Math.round(nightlyGb * 1000) / 1000,
    monthlyGbEstimate: Math.round(monthlyGb * 1000) / 1000,
  };

  console.log("\n=== simulate:nightly summary ===");
  console.log(JSON.stringify(summary, null, 2));

  const outDir = join(process.cwd(), "artifacts", "brand-audit", "history");
  mkdirSync(outDir, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(outDir, `${runId}-nightly-sim.json`), `${JSON.stringify(summary, null, 2)}\n`);
}

run().catch((e) => {
  console.error("[simulate:nightly] failed", e);
  process.exit(1);
});
