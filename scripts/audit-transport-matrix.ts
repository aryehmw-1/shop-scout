/**
 * Transport × behavior audit matrix.
 *
 * For a retailer, runs the rendered executor across every configured transport
 * (direct / datacenter / residential) and a set of behaviors, capturing
 * challenge outcome + outbound identity (IP/ASN/geo) per cell, then synthesizes
 * the minimum-cost transport that achieves stable extraction.
 *
 * Usage:
 *   npm run audit:transport-matrix -- --retailer=walmart
 *   npm run audit:transport-matrix -- --retailer=target --behaviors=cold,humanized
 *   npm run audit:transport-matrix -- --retailer=kroger --transports=residential
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "./load-env.mjs";

loadEnv();

import { fetchRenderedHtml } from "../src/lib/offers/retailer-adapters/rendered-fetch";
import {
  availableTransports,
  newStickySessionId,
  type ProxyTransport,
} from "../src/lib/net/proxy-routing";
import { getTransportPolicy } from "../src/lib/retailers/fetch-strategy";
import { recommendTransports } from "../src/lib/retailers/health/strategy-metrics";
import type { RetailerId } from "../src/lib/types";
import type { SessionBehaviorId } from "../src/lib/retailers/session-behavior";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

const DEFAULT_URLS: Partial<Record<RetailerId, string>> = {
  amazon: "https://www.amazon.com/s?k=whole+milk",
  walmart: "https://www.walmart.com/search?q=whole+milk",
  target: "https://www.target.com/s?searchTerm=whole+milk",
  kroger: "https://www.kroger.com/search?query=whole%20milk",
  costco: "https://www.costco.com/CatalogSearch?keyword=whole+milk",
};

async function main() {
  const retailer = (arg("retailer") ?? "walmart") as RetailerId;
  const url = arg("url") ?? DEFAULT_URLS[retailer] ?? DEFAULT_URLS.amazon!;
  const configured = availableTransports();
  const requested = (arg("transports")?.split(",") as ProxyTransport[] | undefined) ?? configured;
  const transports = requested.filter((t) => configured.includes(t));
  const behaviors = (arg("behaviors")?.split(",") as SessionBehaviorId[] | undefined) ?? [
    "cold",
    "humanized",
  ];
  // Residential exits default to country=us so the egress geo matches the store.
  const country = arg("country") ?? "us";
  const region = arg("region");

  console.log("=== transport matrix ===");
  console.log({
    retailer,
    url,
    transportPolicy: getTransportPolicy(retailer),
    configuredTransports: configured,
    residentialGeo: { country, region: region ?? "(none)" },
    testing: { transports, behaviors },
  });
  const unconfigured = (requested as ProxyTransport[]).filter((t) => !configured.includes(t));
  if (unconfigured.length) {
    console.warn(
      `\n⚠ skipping unconfigured transports: ${unconfigured.join(", ")} ` +
        `(set DECODO_RESI_* for residential, DECODO_DC_*/DECODO_PROXY_* for datacenter)`,
    );
  }

  // Task 7: for proxied transports, compare blocking-off vs blocking+early so
  // we can see whether asset blocking + early extraction turns a residential
  // timeout into a usable partial DOM.
  const blockOff = /^(1|true|on|yes)$/i.test(arg("compareBlocking") ?? "1");

  const cells: Array<Record<string, unknown>> = [];
  for (const transport of transports) {
    // One sticky session per transport so residential IP is consistent.
    const sessionId = transport === "residential" ? newStickySessionId() : undefined;
    for (const behavior of behaviors) {
      const variants: Array<{ tag: string; opts: Record<string, unknown> }> = [
        { tag: "default", opts: {} },
      ];
      if (blockOff && transport !== "direct") {
        variants.push({
          tag: "no-block+full-lifecycle",
          opts: { blockResources: [], waitStrategy: "domcontentloaded", earlyExtraction: false },
        });
        variants.push({
          tag: "block+adaptive+early",
          opts: {
            blockResources: ["image", "media", "font"],
            waitStrategy: "adaptive",
            earlyExtraction: true,
          },
        });
      }

      for (const variant of variants) {
        process.stdout.write(`\n→ ${transport} + ${behavior} [${variant.tag}] ... `);
        const res = await fetchRenderedHtml(url, retailer, {
          transport,
          behaviorId: behavior,
          stickySessionId: sessionId,
          country: transport === "residential" ? country : undefined,
          region: transport === "residential" ? region : undefined,
          probeIdentity: true,
          alwaysCapture: true,
          ...variant.opts,
        });
        const lc = res.lifecycle;
        const cell = {
          transport,
          behavior,
          variant: variant.tag,
          ok: res.ok,
          status: res.status,
          category: res.classification.category,
          reason: res.classification.reason,
          vendor: res.classification.vendor ?? "-",
          sticky: res.sticky,
          ip: res.identity?.ip ?? "-",
          asn: res.identity?.asn ?? "-",
          geo: res.identity?.country ?? "-",
          reqCountry: res.geoCountry ?? "-",
          coherence: res.coherence?.score ?? "-",
          geoMismatches: res.coherence?.mismatches ?? [],
          suspicion: res.suspicion?.score ?? "-",
          firstByteMs: lc?.firstByteMs ?? "-",
          committed: lc?.committed ?? false,
          interactive: lc?.becameInteractive ?? false,
          challengeDetected: lc?.challengeDetected ?? false,
          partial: lc?.partialExtraction ?? false,
          domBytes: lc?.domBytesAtExtraction ?? 0,
          blockedReq: lc?.blockedRequests ?? 0,
          timedOut: lc?.timedOut ?? false,
          timingMs: res.timingMs,
          error: res.error ?? "",
        };
        cells.push(cell);
        console.log(res.ok ? "OK" : `BLOCKED (${res.classification.reason})`);
      }
    }
  }

  console.log("\n=== matrix results ===");
  console.table(
    cells.map((c) => ({
      transport: c.transport,
      behavior: c.behavior,
      variant: c.variant,
      ok: c.ok,
      reason: c.reason,
      geo: c.geo,
      coherence: c.coherence,
      fb_ms: c.firstByteMs,
      interactive: c.interactive,
      partial: c.partial,
      domBytes: c.domBytes,
      timedOut: c.timedOut,
      ms: c.timingMs,
    })),
  );

  console.log("\n=== transport recommendation ===");
  const rec = recommendTransports().find((r) => r.retailerId === retailer);
  console.log(rec ?? "(no data)");

  const outDir = join(process.cwd(), "artifacts", "transport-matrix");
  mkdirSync(outDir, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const report = { runId, retailer, url, transports, behaviors, cells, recommendation: rec };
  writeFileSync(join(outDir, `${runId}-${retailer}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nWrote ${join(outDir, `${runId}-${retailer}.json`)}`);
}

main().catch((e) => {
  console.error("[audit:transport-matrix] failed", e);
  process.exit(1);
});
