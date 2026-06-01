import type { RetailerId } from "../types";
import type { ProxyTransport } from "../net/proxy-routing";

/**
 * First-class, per-retailer fetch strategy. Retailers are NOT interchangeable:
 * Amazon is a stable direct/golden path, Walmart/Target need proxy + likely a
 * rendered fetch, Kroger/Costco are hostile (403/timeout) and want a
 * residential-ready path. This is the single place that decides HOW we fetch a
 * retailer, separate from proxy selection (which decides WHERE we route).
 */

export type FetchMethod =
  | "direct" // plain HTTP fetch (cheapest)
  | "lightweight" // HTTP fetch with full browser-like headers / session hints
  | "playwright"; // headless browser render (most expensive, JS-challenge capable)

export type ProxyPolicy =
  | "none" // never proxy (direct only)
  | "optional" // direct first, proxy on retry
  | "required" // always proxy
  | "residential-ready"; // requires proxy; datacenter likely insufficient, residential hook

export interface RetailerFetchStrategy {
  retailerId: RetailerId;
  method: FetchMethod;
  proxyPolicy: ProxyPolicy;
  /** Reuse cookies/session across requests for this retailer. */
  sessionPersistent: boolean;
  /** Ordered escalation when a fetch is classified as blocked. */
  escalation: FetchMethod[];
  /** Highly reliable extraction — prioritize for ingestion. */
  goldenPath: boolean;
  notes?: string;
}

const DEFAULTS: Partial<Record<RetailerId, RetailerFetchStrategy>> = {
  amazon: {
    retailerId: "amazon",
    method: "direct",
    proxyPolicy: "optional",
    sessionPersistent: false,
    escalation: ["direct", "lightweight"],
    goldenPath: true,
    notes: "Stable direct + proxy; low block rate. Primary golden-path retailer.",
  },
  walmart: {
    retailerId: "walmart",
    method: "lightweight",
    proxyPolicy: "required",
    sessionPersistent: true,
    escalation: ["lightweight", "playwright"],
    goldenPath: false,
    notes: "Reachable but PerimeterX interstitials; needs proxy, likely render.",
  },
  target: {
    retailerId: "target",
    method: "lightweight",
    proxyPolicy: "required",
    sessionPersistent: true,
    escalation: ["lightweight", "playwright"],
    goldenPath: false,
    notes: "Reachable but heavy/interstitialized; proxy + render escalation.",
  },
  kroger: {
    retailerId: "kroger",
    method: "playwright",
    proxyPolicy: "residential-ready",
    sessionPersistent: true,
    escalation: ["playwright"],
    goldenPath: false,
    notes: "403/timeout via datacenter; residential proxy + render likely required.",
  },
  costco: {
    retailerId: "costco",
    method: "playwright",
    proxyPolicy: "residential-ready",
    sessionPersistent: true,
    escalation: ["playwright"],
    goldenPath: false,
    notes: "403 even via proxy; residential + render. Experimental.",
  },
  aldi: {
    retailerId: "aldi",
    method: "lightweight",
    proxyPolicy: "optional",
    sessionPersistent: false,
    escalation: ["lightweight"],
    goldenPath: false,
  },
  instacart: {
    retailerId: "instacart",
    method: "playwright",
    proxyPolicy: "required",
    sessionPersistent: true,
    escalation: ["playwright"],
    goldenPath: false,
  },
};

const FALLBACK: Omit<RetailerFetchStrategy, "retailerId"> = {
  method: "direct",
  proxyPolicy: "optional",
  sessionPersistent: false,
  escalation: ["direct", "lightweight"],
  goldenPath: false,
};

const VALID_METHODS: FetchMethod[] = ["direct", "lightweight", "playwright"];
const VALID_POLICIES: ProxyPolicy[] = ["none", "optional", "required", "residential-ready"];

function envMethod(retailerId: RetailerId): FetchMethod | undefined {
  const v = process.env[`INDEX_FETCH_METHOD_${retailerId.toUpperCase()}`]?.trim().toLowerCase();
  return v && (VALID_METHODS as string[]).includes(v) ? (v as FetchMethod) : undefined;
}

function envPolicy(retailerId: RetailerId): ProxyPolicy | undefined {
  const v = process.env[`INDEX_PROXY_POLICY_${retailerId.toUpperCase()}`]?.trim().toLowerCase();
  return v && (VALID_POLICIES as string[]).includes(v) ? (v as ProxyPolicy) : undefined;
}

export function getRetailerFetchStrategy(retailerId: RetailerId): RetailerFetchStrategy {
  const base = DEFAULTS[retailerId] ?? { retailerId, ...FALLBACK };
  const goldenOverride = goldenPathRetailers();
  return {
    ...base,
    method: envMethod(retailerId) ?? base.method,
    proxyPolicy: envPolicy(retailerId) ?? base.proxyPolicy,
    goldenPath: goldenOverride ? goldenOverride.includes(retailerId) : base.goldenPath,
  };
}

/**
 * E — golden-path ingestion mode. Returns the explicit retailer allowlist when
 * INDEX_GOLDEN_PATH_RETAILERS is set, otherwise undefined (use per-retailer
 * defaults). When INDEX_GOLDEN_PATH_ONLY=1, only golden-path retailers run.
 */
export function goldenPathRetailers(): RetailerId[] | undefined {
  const raw = process.env.INDEX_GOLDEN_PATH_RETAILERS?.trim();
  if (!raw) return undefined;
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as RetailerId[];
}

export function isGoldenPathOnly(): boolean {
  const v = process.env.INDEX_GOLDEN_PATH_ONLY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function isGoldenPathRetailer(retailerId: RetailerId): boolean {
  return getRetailerFetchStrategy(retailerId).goldenPath;
}

/**
 * Order retailers for ingestion so golden-path/stable retailers run first.
 * In golden-path-only mode, hostile retailers are dropped entirely.
 */
export function prioritizeRetailersByStrategy(retailers: RetailerId[]): RetailerId[] {
  const onlyGolden = isGoldenPathOnly();
  const rank = (r: RetailerId): number => {
    const s = getRetailerFetchStrategy(r);
    if (s.goldenPath) return 0;
    if (s.proxyPolicy === "optional" || s.proxyPolicy === "none") return 1;
    if (s.proxyPolicy === "required") return 2;
    return 3; // residential-ready / hostile
  };
  return retailers
    .filter((r) => (onlyGolden ? isGoldenPathRetailer(r) : true))
    .slice()
    .sort((a, b) => rank(a) - rank(b));
}

/** Whether this retailer must route through a proxy. */
export function strategyRequiresProxy(retailerId: RetailerId): boolean {
  const p = getRetailerFetchStrategy(retailerId).proxyPolicy;
  return p === "required" || p === "residential-ready";
}

/**
 * Ordered transport preference per retailer (cheapest viable first). Derived
 * from observed behavior: Amazon works direct; Target often passes via
 * datacenter; Walmart's PerimeterX needs residential; Kroger/Costco residential.
 * Override with INDEX_TRANSPORT_POLICY_<RETAILER>=direct,datacenter,residential.
 */
const TRANSPORT_POLICY: Partial<Record<RetailerId, ProxyTransport[]>> = {
  amazon: ["direct", "datacenter"],
  walmart: ["residential", "datacenter"],
  target: ["datacenter", "residential"],
  kroger: ["residential"],
  costco: ["residential"],
  instacart: ["residential", "datacenter"],
  aldi: ["direct", "datacenter"],
};

const VALID_TRANSPORTS: ProxyTransport[] = ["direct", "datacenter", "residential"];

export function getTransportPolicy(retailerId: RetailerId): ProxyTransport[] {
  const env = process.env[`INDEX_TRANSPORT_POLICY_${retailerId.toUpperCase()}`]?.trim();
  if (env) {
    const parsed = env
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is ProxyTransport => (VALID_TRANSPORTS as string[]).includes(s));
    if (parsed.length) return parsed;
  }
  return TRANSPORT_POLICY[retailerId] ?? ["direct", "datacenter", "residential"];
}

export function listTransportPolicies(
  retailers: RetailerId[],
): Array<{ retailerId: RetailerId; policy: ProxyTransport[] }> {
  return retailers.map((retailerId) => ({ retailerId, policy: getTransportPolicy(retailerId) }));
}

export function listRetailerFetchStrategies(retailers: RetailerId[]): RetailerFetchStrategy[] {
  return retailers.map(getRetailerFetchStrategy);
}
