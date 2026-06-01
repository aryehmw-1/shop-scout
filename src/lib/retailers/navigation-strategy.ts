import type { RetailerId } from "../types";
import type { ProxyTransport } from "../net/proxy-routing";

/**
 * Navigation + wait strategy for the rendered executor.
 *
 * Key lesson from the Walmart residential matrix: residential transport is NOT
 * PerimeterX-blocked — it stalls in page.goto because the full DOMContentLoaded
 * lifecycle never settles (slow residential IP + heavy asset/tracker payload).
 * So we stop depending on lifecycle completion: navigate with "commit" (returns
 * once the document response arrives), block heavy assets, then poll for
 * readiness and extract partial DOM before any hard timeout.
 */
export type WaitStrategy =
  | "commit" // resolve as soon as navigation commits (first response)
  | "domcontentloaded"
  | "load"
  | "networkidle"
  | "adaptive"; // commit + readiness polling + early extraction (default for proxied)

export type BlockableResource =
  | "image"
  | "media"
  | "font"
  | "stylesheet"
  | "script"
  | "xhr"
  | "fetch"
  | "websocket"
  | "other";

export interface NavigationTuning {
  waitStrategy: WaitStrategy;
  /** Hard cap for the initial navigation/commit (ms). */
  navTimeoutMs: number;
  /** Budget for readiness polling AFTER commit before we extract partial DOM (ms). */
  contentTimeoutMs: number;
  /** Poll interval while waiting for readiness (ms). */
  pollIntervalMs: number;
  /** Resource types to abort during navigation (bandwidth + stall reduction). */
  blockResources: BlockableResource[];
  /** Extra URL substrings to block (trackers/analytics that keep sockets open). */
  blockUrlPatterns: string[];
  /** Extract + classify partial DOM even if the lifecycle didn't complete. */
  earlyExtraction: boolean;
  /** DOM byte floor before partial extraction is considered meaningful. */
  minReadyBytes: number;
}

/** Heavy assets that don't affect product extraction or PerimeterX JS. */
const DEFAULT_BLOCK: BlockableResource[] = ["image", "media", "font"];

/**
 * Tracker/analytics hosts that frequently hold connections open and prevent
 * networkidle from ever settling. Safe to block: not part of product DOM.
 * NOTE: PerimeterX (px-cdn/px-cloud) and Walmart's own JS are intentionally
 * NOT blocked so challenge resolution still works.
 */
const DEFAULT_BLOCK_URLS = [
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "scorecardresearch.com",
  "facebook.net",
  "/gtm.js",
  "quantserve.com",
  "bat.bing.com",
  "ads.",
];

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === "") return fallback;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

function parseIntEnv(v: string | undefined, fallback: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface NavigationTuningOverrides {
  waitStrategy?: WaitStrategy;
  blockResources?: BlockableResource[];
  earlyExtraction?: boolean;
  navTimeoutMs?: number;
  contentTimeoutMs?: number;
}

/**
 * Resolve navigation tuning for a retailer + transport. Residential (and any
 * proxied transport) gets longer timeouts, asset blocking, and adaptive/early
 * extraction by default — that's the configuration that turns a residential
 * timeout into a usable partial DOM. Everything is env- and call-overridable.
 */
export function getNavigationTuning(
  retailerId: RetailerId,
  transport: ProxyTransport,
  overrides: NavigationTuningOverrides = {},
): NavigationTuning {
  const proxied = transport !== "direct";
  const residential = transport === "residential";

  const waitStrategy: WaitStrategy =
    overrides.waitStrategy ??
    (process.env.INDEX_RENDER_WAIT as WaitStrategy | undefined) ??
    (proxied ? "adaptive" : "domcontentloaded");

  const earlyExtraction =
    overrides.earlyExtraction ??
    parseBool(process.env.INDEX_RENDER_EARLY_EXTRACT, proxied);

  // Block assets by default when proxied (residential bandwidth is the stall).
  const blockDefault = proxied ? DEFAULT_BLOCK : [];
  const blockResources =
    overrides.blockResources ??
    (process.env.INDEX_RENDER_BLOCK
      ? (process.env.INDEX_RENDER_BLOCK.split(/[,;\s]+/).filter(Boolean) as BlockableResource[])
      : blockDefault);

  const navTimeoutMs =
    overrides.navTimeoutMs ??
    parseIntEnv(process.env.INDEX_RENDER_NAV_TIMEOUT_MS, residential ? 30000 : 20000);

  const contentTimeoutMs =
    overrides.contentTimeoutMs ??
    parseIntEnv(process.env.INDEX_RENDER_CONTENT_TIMEOUT_MS, residential ? 25000 : 12000);

  return {
    waitStrategy,
    navTimeoutMs,
    contentTimeoutMs,
    pollIntervalMs: parseIntEnv(process.env.INDEX_RENDER_POLL_MS, 750),
    blockResources,
    blockUrlPatterns: process.env.INDEX_RENDER_BLOCK_URLS
      ? process.env.INDEX_RENDER_BLOCK_URLS.split(/[,;\s]+/).filter(Boolean)
      : DEFAULT_BLOCK_URLS,
    earlyExtraction,
    minReadyBytes: parseIntEnv(process.env.INDEX_RENDER_MIN_BYTES, 1500),
  };
}

/** Pure predicate: should this request be aborted given the tuning? */
export function shouldBlockRequest(
  resourceType: string,
  url: string,
  tuning: NavigationTuning,
): boolean {
  if ((tuning.blockResources as string[]).includes(resourceType)) return true;
  if (tuning.blockUrlPatterns.some((p) => url.includes(p))) return true;
  return false;
}

/** Lifecycle diagnostics captured during a (possibly stalled) navigation. */
export interface NavigationLifecycle {
  waitStrategy: WaitStrategy;
  committed: boolean;
  firstByteMs?: number;
  documentStatus?: number;
  domContentLoaded: boolean;
  loadEvent: boolean;
  networkIdle: boolean;
  becameInteractive: boolean;
  readyState?: string;
  challengeDetected: boolean;
  partialExtraction: boolean;
  domBytesAtExtraction: number;
  timedOut: boolean;
  blockedRequests: number;
  blockedBytesApprox: number;
  stages: Array<{ stage: string; atMs: number; note?: string }>;
}

export function newLifecycle(waitStrategy: WaitStrategy): NavigationLifecycle {
  return {
    waitStrategy,
    committed: false,
    domContentLoaded: false,
    loadEvent: false,
    networkIdle: false,
    becameInteractive: false,
    challengeDetected: false,
    partialExtraction: false,
    domBytesAtExtraction: 0,
    timedOut: false,
    blockedRequests: 0,
    blockedBytesApprox: 0,
    stages: [],
  };
}
