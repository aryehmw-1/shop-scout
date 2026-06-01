import { performance } from "node:perf_hooks";
import { fetchRetailerHtmlWithRetries } from "../src/lib/offers/retailer-adapters/retailer-fetch";
import {
  getProxyPool,
  getUndiciDispatcher,
  pickProxyRoute,
  proxyRedacted,
} from "../src/lib/net/proxy-routing";
import type { RetailerId } from "../src/lib/types";

const RETAILER_URLS: Array<{ retailer: RetailerId; url: string }> = [
  { retailer: "amazon", url: "https://www.amazon.com/s?k=whole+milk" },
  { retailer: "walmart", url: "https://www.walmart.com/search?q=whole+milk" },
  { retailer: "target", url: "https://www.target.com/s?searchTerm=whole+milk" },
  { retailer: "kroger", url: "https://www.kroger.com/search?query=whole%20milk" },
  { retailer: "costco", url: "https://www.costco.com/CatalogSearch?keyword=whole+milk" },
];

async function ipCheck(label: string, dispatcher?: any) {
  const start = performance.now();
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      dispatcher,
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "ShopScoutProxyTest/1.0" },
    } as any);
    const body = await res.text();
    const latencyMs = Math.round(performance.now() - start);
    return {
      label,
      ok: res.ok,
      status: res.status,
      latencyMs,
      body: body.slice(0, 200),
    };
  } catch (e) {
    return {
      label,
      ok: false,
      status: 0,
      latencyMs: Math.round(performance.now() - start),
      body: String(e).slice(0, 200),
    };
  }
}

async function retailerCheck(retailer: RetailerId, url: string) {
  const start = performance.now();
  const row = await fetchRetailerHtmlWithRetries(url, retailer);
  const latencyMs = Math.round(performance.now() - start);
  return {
    retailer,
    ok: Boolean(row),
    latencyMs,
    bytes: row ? Buffer.byteLength(row.html, "utf8") : 0,
    proxyUsed: row?.proxyUsed ?? false,
    status: row?.status ?? 0,
    resolvedUrl: row?.resolvedUrl?.slice(0, 120) ?? "",
  };
}

async function main() {
  const proxyPool = getProxyPool();
  console.log("=== Proxy configuration ===");
  console.log({
    configuredProxyCount: proxyPool.length,
    proxies: proxyPool.map(proxyRedacted),
    directFirst: (process.env.INDEX_PROXY_DIRECT_FIRST ?? "1") !== "0",
  });

  const directIp = await ipCheck("direct");
  let proxyIp = null;
  if (proxyPool.length > 0) {
    const route = pickProxyRoute({ seed: "proxy-test", attempt: 2 });
    const dispatcher = await getUndiciDispatcher(route.proxyUrl);
    proxyIp = await ipCheck(`proxy:${proxyRedacted(route.proxyUrl)}`, dispatcher);
  }

  console.log("\n=== Outbound IP check ===");
  console.table([directIp, ...(proxyIp ? [proxyIp] : [])]);

  console.log("\n=== Retailer accessibility check ===");
  const checks = [];
  for (const { retailer, url } of RETAILER_URLS) {
    checks.push(await retailerCheck(retailer, url));
  }
  console.table(checks);

  const okCount = checks.filter((c) => c.ok).length;
  const proxyUsedCount = checks.filter((c) => c.proxyUsed).length;
  const avgLatency = Math.round(
    checks.reduce((sum, c) => sum + c.latencyMs, 0) / Math.max(1, checks.length),
  );

  console.log("\n=== Summary ===");
  console.log({
    retailersPassed: `${okCount}/${checks.length}`,
    proxyUsedCount,
    avgLatencyMs: avgLatency,
    note:
      okCount < 2 ?
        "Low pass count: check proxy credentials/routing and anti-bot blocks."
      : "Proxy routing appears functional for at least part of retailer set.",
  });

  if (!directIp.ok || (proxyPool.length > 0 && !proxyIp?.ok)) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[test:proxy] failed", e);
  process.exit(1);
});
