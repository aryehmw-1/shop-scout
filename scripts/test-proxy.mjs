/**
 * Proxy routing smoke test.
 * - loads .env.local / .env (standalone node scripts don't get Next's env)
 * - verifies outbound IP direct/proxy
 * - checks retailer accessibility + latency
 * - logs bandwidth-friendly fetch behavior
 */
import { performance } from "node:perf_hooks";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { loadEnv } from "./load-env.mjs";
import { getProxyPool, describeProxyConfig, classifyProvider, proxyRedacted, resolveResidentialProxy, redactProxyUsername } from "./proxy-config.mjs";
import { classifyRetailerResponse } from "./response-classify.mjs";

loadEnv();

const RETAILERS = [
  { retailer: "amazon", url: "https://www.amazon.com/s?k=whole+milk" },
  { retailer: "walmart", url: "https://www.walmart.com/search?q=whole+milk" },
  { retailer: "target", url: "https://www.target.com/s?searchTerm=whole+milk" },
  { retailer: "kroger", url: "https://www.kroger.com/search?query=whole%20milk" },
  { retailer: "costco", url: "https://www.costco.com/CatalogSearch?keyword=whole+milk" },
];

async function ipCheck(label, proxyUrl) {
  const start = performance.now();
  try {
    const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
    const res = await undiciFetch("https://api.ipify.org?format=json", {
      dispatcher,
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "ShopScoutProxyTest/1.0" },
    });
    const body = await res.text();
    return {
      label,
      ok: res.ok,
      status: res.status,
      latencyMs: Math.round(performance.now() - start),
      body: body.slice(0, 120),
    };
  } catch (e) {
    return {
      label,
      ok: false,
      status: 0,
      latencyMs: Math.round(performance.now() - start),
      body: String(e).slice(0, 120),
    };
  }
}

async function retailerCheck(retailer, url, proxyUrl) {
  const start = performance.now();
  try {
    const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
    const res = await undiciFetch(url, {
      dispatcher,
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await res.text();
    const cls = classifyRetailerResponse({
      retailerId: retailer,
      status: res.status,
      html,
      headers: res.headers,
    });
    return {
      retailer,
      ok: cls.ok,
      status: res.status,
      latencyMs: Math.round(performance.now() - start),
      bytes: cls.bytes,
      blocked: !cls.ok,
      reason: cls.reason,
      vendor: cls.vendor ?? "",
      proxyUsed: Boolean(proxyUrl),
    };
  } catch (e) {
    return {
      retailer,
      ok: false,
      status: 0,
      latencyMs: Math.round(performance.now() - start),
      bytes: 0,
      blocked: false,
      proxyUsed: Boolean(proxyUrl),
      error: String(e).slice(0, 120),
    };
  }
}

async function run() {
  const diag = describeProxyConfig();
  const pool = getProxyPool();
  const chosenProxy = pool[0];

  console.log("=== Proxy config ===");
  console.log({
    enabled: diag.enabled,
    configuredCount: diag.configuredCount,
    chosenProxy: diag.chosenProxy,
    provider: diag.provider,
    mode: diag.mode,
    transports: diag.transports,
    directFirst: (process.env.INDEX_PROXY_DIRECT_FIRST ?? "1") !== "0",
  });

  console.log("\n=== Proxy env detection (redacted) ===");
  console.table(
    diag.components.map((c) => ({
      prefix: c.prefix,
      host: c.hasHost,
      port: c.hasPort,
      username: c.hasUsername,
      password: c.hasPassword,
      assembled: c.assembled ?? "—",
      valid: c.valid,
    })),
  );

  if (diag.warnings.length) {
    console.warn("\n=== Proxy warnings ===");
    for (const w of diag.warnings) console.warn(`  ⚠ ${w}`);
  }

  const resi = resolveResidentialProxy({});
  if (resi) {
    console.log("\n=== Residential proxy (PROXY_* / DECODO_RESI_*) ===");
    console.log({
      envSource: process.env.PROXY_USERNAME ? "PROXY_*" : "DECODO_RESI_*",
      host: resi.host,
      port: resi.port,
      username: redactProxyUsername(resi.username),
      urlRedacted: proxyRedacted(resi.url),
    });
    const resiIp = await ipCheck("residential", resi.url);
    console.table([resiIp]);
    if (resiIp.status === 407) {
      console.error("⚠ HTTP 407 — proxy auth rejected. Check PROXY_USERNAME / PROXY_PASSWORD in .env.local.");
    }
  }

  if (diag.configuredCount === 0) {
    console.error(
      "\n[test:proxy] No usable proxy detected. Expected DECODO_PROXY_HOST/PORT/USERNAME/PASSWORD " +
        "in .env.local (or DECODO_PROXY_URL). Continuing with direct-only checks.",
    );
  }

  console.log("\n=== Outbound IP ===");
  const direct = await ipCheck("direct", undefined);
  const proxied = chosenProxy ? await ipCheck("proxy", chosenProxy) : null;
  console.table([direct, ...(proxied ? [proxied] : [])]);

  const ipChanged = Boolean(proxied?.ok && direct.ok && proxied.body !== direct.body);
  if (proxied) {
    console.log(
      ipChanged ?
        "✓ Outbound IP changed through proxy — Decodo layer is engaged."
      : "⚠ Proxy IP matches direct IP (or proxy unreachable) — proxy may NOT be routing.",
    );
  }

  console.log("\n=== Retailer accessibility (direct) ===");
  const directRows = [];
  for (const r of RETAILERS) directRows.push(await retailerCheck(r.retailer, r.url, undefined));
  console.table(directRows);

  let proxyRows = [];
  if (chosenProxy) {
    console.log("\n=== Retailer accessibility (proxy) ===");
    for (const r of RETAILERS) proxyRows.push(await retailerCheck(r.retailer, r.url, chosenProxy));
    console.table(proxyRows);
  }

  const used = proxyRows.length ? proxyRows : directRows;
  const passCount = used.filter((r) => r.ok).length;
  const blockedCount = used.filter((r) => r.blocked).length;
  const avgLatency = Math.round(used.reduce((sum, r) => sum + r.latencyMs, 0) / used.length);

  console.log("\n=== Summary ===");
  console.log({
    mode: proxyRows.length ? "proxy" : "direct",
    provider: classifyProvider(chosenProxy),
    proxyEngaged: ipChanged,
    passCount: `${passCount}/${used.length}`,
    blockedCount,
    avgLatencyMs: avgLatency,
    totalBytes: used.reduce((sum, r) => sum + (r.bytes || 0), 0),
  });

  if (!direct.ok || (proxied && !proxied.ok)) process.exit(1);
}

run().catch((e) => {
  console.error("[test:proxy] failed", e);
  process.exit(1);
});
