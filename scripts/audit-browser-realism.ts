/**
 * Browser-realism / anti-bot lab.
 *
 * Primary experiment (recommended):
 *   npm run audit:browser-realism -- --retailer=walmart --transport=residential \
 *     --behavior=cold --wait=adaptive --block=image,media,font --warmup=homepage
 *
 * Compare mode (experimental — one browser, sequential variants):
 *   RENDERED_LAB_LOG=1 npm run audit:browser-realism -- --retailer=walmart \
 *     --transport=residential --compare-warmup --allow-compare-warmup
 */
import { loadEnv } from "./load-env.mjs";

loadEnv({ verbose: true });
process.env.RENDERED_LAB_LOG = process.env.RENDERED_LAB_LOG ?? "1";

// import {
//   fetchRenderedHtml,
//   fetchRenderedCompareSession,
//   type RenderedFetchResult,
//   type CompareVariantResult,
// } from "../src/lib/offers/retailer-adapters/rendered-fetch";

type RenderedFetchResult = {
  ok: boolean;
  status: number;
  error?: string;
  failureKind?: string;
  warmupMode?: string;
  behavior?: string;
  transport?: string;
  proxyUsed?: boolean;
  sticky?: boolean;
  classification: {
    category: string;
    reason: string;
    vendor?: string;
    ok: boolean;
  };
  timingMs: number;
  artifactDir?: string | null;
  identity?: {
    ip?: string;
    asn?: string;
    isp?: string;
    country?: string;
    city?: string;
    ok?: boolean;
  };
  coherence?: { score: number; mismatches: string[] };
  lifecycle?: {
    stages: Array<Record<string, unknown>>;
    waitStrategy?: string;
    committed?: boolean;
    firstByteMs?: number;
    becameInteractive?: boolean;
    challengeDetected?: boolean;
    domBytesAtExtraction?: number;
    timedOut?: boolean;
  };
  redirectChain?: Array<{ url: string; status: number }>;
  realism?: unknown;
  suspicion?: { score?: number; reasons?: string[] };
  challenge?: { score?: number; factors?: string[] };
  geoCountry?: string;
};

type CompareVariantResult = RenderedFetchResult & { label: string };

function stubRenderedFetchDisabled(reason = "rendered-fetch temporarily disabled"): RenderedFetchResult {
  return {
    ok: false,
    status: 0,
    error: reason,
    failureKind: "unknown",
    classification: {
      ok: false,
      category: "empty",
      reason: "not_configured",
    },
    timingMs: 0,
    artifactDir: null,
  };
}
import {
  newStickySessionId,
  getProxyForTransport,
  getPlaywrightProxyConfig,
  resolveResidentialProxy,
  redactProxyUsername,
  describeProxyConfig,
  type ProxyTransport,
} from "../src/lib/net/proxy-routing";
import { isCompareWarmupAllowed } from "../src/lib/retailers/rendered-lab";
import type { RetailerId } from "../src/lib/types";
import type { SessionBehaviorId } from "../src/lib/retailers/session-behavior";
import type { WaitStrategy, BlockableResource } from "../src/lib/retailers/navigation-strategy";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseWarmup(raw: string | undefined): boolean | "homepage" | undefined {
  if (!raw) return undefined;
  if (raw === "homepage") return "homepage";
  if (/^(1|true|on|yes)$/i.test(raw)) return true;
  if (/^(0|false|off|no|none|direct)$/i.test(raw)) return false;
  return undefined;
}

const DEFAULT_URLS: Partial<Record<RetailerId, string>> = {
  amazon: "https://www.amazon.com/s?k=whole+milk",
  walmart: "https://www.walmart.com/search?q=whole+milk",
  target: "https://www.target.com/s?searchTerm=whole+milk",
  kroger: "https://www.kroger.com/search?query=whole%20milk",
  costco: "https://www.costco.com/CatalogSearch?keyword=whole+milk",
};

interface RunOpts {
  retailer: RetailerId;
  url: string;
  behaviorId?: SessionBehaviorId;
  transport?: ProxyTransport;
  country?: string;
  region?: string;
  stickySessionId?: string;
  warmup?: boolean | "homepage";
  waitStrategy?: WaitStrategy;
  blockResources?: BlockableResource[];
  earlyExtraction?: boolean;
}

async function runAudit(opts: RunOpts): Promise<RenderedFetchResult> {
  void opts;
  // return fetchRenderedHtml(opts.url, opts.retailer, { ... });
  return stubRenderedFetchDisabled();
}

function printOutcome(label: string, res: RenderedFetchResult | CompareVariantResult) {
  console.log(`\n=== outcome (${label}) ===`);
  console.log({
    ok: res.ok,
    status: res.status,
    failureKind: res.failureKind ?? "(unknown)",
    warmupMode: res.warmupMode ?? "(unknown)",
    behavior: res.behavior,
    transport: res.transport,
    proxyUsed: res.proxyUsed,
    sticky: res.sticky,
    category: res.classification.category,
    reason: res.classification.reason,
    vendor: res.classification.vendor ?? "-",
    timingMs: res.timingMs,
    artifactDir: res.artifactDir ?? "-",
  });

  console.log("\n=== transport identity ===");
  console.log(
    res.identity
      ? {
          ip: res.identity.ip,
          asn: res.identity.asn,
          isp: res.identity.isp,
          geo: res.identity.country,
          city: res.identity.city,
          ok: res.identity.ok,
        }
      : "(shared session identity — see compare header if compare mode)",
  );

  if (res.lifecycle) {
    console.log("\n=== lifecycle stages ===");
    console.table(res.lifecycle.stages);
  }
}

function summarize(res: RenderedFetchResult | CompareVariantResult) {
  const label = "label" in res ? res.label : res.warmupMode ?? "run";
  return {
    variant: label,
    failureKind: res.failureKind ?? "unknown",
    warmupMode: res.warmupMode ?? "-",
    ok: res.ok,
    challenged: res.classification.category === "captcha" || !res.ok,
    reason: res.classification.reason,
    vendor: res.classification.vendor ?? "-",
    timingMs: res.timingMs,
    geo: res.identity?.country ?? "-",
  };
}

async function main() {
  const retailer = (arg("retailer") ?? "walmart") as RetailerId;
  const behaviorId = arg("behavior") as SessionBehaviorId | undefined;
  const transport = arg("transport") as ProxyTransport | undefined;
  const waitStrategy = arg("wait") as WaitStrategy | undefined;
  const blockResources = arg("block")?.split(",").filter(Boolean) as BlockableResource[] | undefined;
  const earlyExtraction = arg("early") ? /^(1|true|on|yes)$/i.test(arg("early")!) : undefined;
  const country = arg("country") ?? (transport === "residential" ? "us" : undefined);
  const region = arg("region");
  const stickyFlag = arg("sticky");
  const sticky = stickyFlag === undefined ? transport === "residential" : /^(1|true|on|yes)$/i.test(stickyFlag);
  const warmup = parseWarmup(arg("warmup"));
  const compareWarmup = hasFlag("compare-warmup");
  const allowCompare = hasFlag("allow-compare-warmup") || isCompareWarmupAllowed();
  const url = arg("url") ?? DEFAULT_URLS[retailer] ?? DEFAULT_URLS.amazon!;

  const stickySessionId = sticky ? newStickySessionId() : undefined;

  console.log("=== browser-realism lab ===");
  console.log({
    retailer,
    behavior: behaviorId ?? "(retailer default)",
    transport: transport ?? "(auto/direct-first)",
    country: country ?? "(default)",
    region: region ?? "(none)",
    sticky,
    waitStrategy: waitStrategy ?? "(tuning default)",
    blockResources: blockResources ?? "(tuning default)",
    earlyExtraction: earlyExtraction ?? "(tuning default)",
    warmup: compareWarmup ? "compare (sequential, one browser)" : (warmup ?? "(transport default)"),
    labLog: process.env.RENDERED_LAB_LOG === "1",
    url,
  });

  if (transport === "residential" || !transport) {
    const proxyDiag = describeProxyConfig();
    console.log("\n=== proxy env resolution ===");
    console.log({
      envSource: process.env.PROXY_USERNAME ? "PROXY_*" : "DECODO_RESI_*",
      configuredTransports: proxyDiag.transports,
      warnings: proxyDiag.warnings.length ? proxyDiag.warnings : "(none)",
    });
    const resolved = resolveResidentialProxy({ sessionId: stickySessionId, country, region });
    const tp = transport
      ? getProxyForTransport(transport, { sessionId: stickySessionId, country, region })
      : undefined;
    const pw = tp?.url ? getPlaywrightProxyConfig(tp.url) : undefined;
    console.log({
      host: resolved?.host ?? "(missing)",
      port: resolved?.port ?? "(missing)",
      resolvedUsername: resolved ? redactProxyUsername(resolved.username) : "(missing)",
      sticky: resolved?.sticky ?? false,
      playwrightHasAuth: Boolean(pw?.username && pw?.password),
    });
  }

  const baseOpts: RunOpts = {
    retailer,
    url,
    behaviorId,
    transport,
    country,
    region,
    stickySessionId,
    waitStrategy,
    blockResources,
    earlyExtraction,
  };

  if (compareWarmup) {
    if (!allowCompare) {
      console.error(
        "\n⚠ compare-warmup is experimental and disabled by default.\n" +
          "  Use --warmup=homepage for the primary experiment, or pass --allow-compare-warmup\n" +
          "  (or set INDEX_ENABLE_COMPARE_WARMUP=1) once transport is stable.",
      );
      process.exit(2);
    }

    console.log("\n=== warm-session A/B (one browser, sequential, no parallelism) ===");
    void url;
    void retailer;
    void behaviorId;
    void transport;
    void country;
    void region;
    void stickySessionId;
    void waitStrategy;
    void blockResources;
    void earlyExtraction;
    // const session = await fetchRenderedCompareSession(url, retailer, [...], { ... });
    console.error("\n⚠ compare-warmup unavailable: rendered-fetch temporarily disabled");
    process.exit(2);
    return;
  }

  // Primary path: single run (--warmup=homepage recommended for Walmart warm-session experiment)
  const effectiveWarmup = warmup ?? (transport === "residential" ? false : undefined);
  const res = await runAudit({ ...baseOpts, warmup: effectiveWarmup });
  if (res.error) {
    console.error(`\n⚠ executor could not run: ${res.error}`);
    if (/not_installed/.test(res.error)) {
      console.error("  Install browsers: npx playwright install chromium");
    }
    process.exit(2);
  }

  printOutcome(res.warmupMode ?? "run", res);

  console.log("\n=== geo coherence ===");
  if (res.coherence) {
    console.log({
      requestedCountry: res.geoCountry ?? "(default)",
      score: res.coherence.score,
      mismatches: res.coherence.mismatches.length ? res.coherence.mismatches : "(none)",
    });
  } else {
    console.log("(no identity probe / coherence unavailable)");
  }

  console.log("\n=== realism signals ===");
  console.log(res.realism ?? "(probe unavailable)");

  console.log("\n=== scores ===");
  console.log({
    botSuspicion: res.suspicion?.score,
    suspicionReasons: res.suspicion?.reasons,
    challengeProbability: res.challenge?.score,
    challengeFactors: res.challenge?.factors,
  });

  console.log("\n=== navigation lifecycle ===");
  if (res.lifecycle) {
    const lc = res.lifecycle;
    console.log({
      waitStrategy: lc.waitStrategy,
      committed: lc.committed,
      firstByteMs: lc.firstByteMs,
      becameInteractive: lc.becameInteractive,
      challengeDetected: lc.challengeDetected,
      domBytesAtExtraction: lc.domBytesAtExtraction,
      timedOut: lc.timedOut,
    });
  }

  console.log("\n=== redirect chain (documents) ===");
  console.table(res.redirectChain);
}

main().catch((e) => {
  console.error("[audit:browser-realism] failed", e);
  process.exit(1);
});
