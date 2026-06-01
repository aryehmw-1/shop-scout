import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RetailerId } from "../../types";
import {
  getRetailerFetchProfile,
  shouldUseProxyForRetailer,
} from "./fetch-profiles";
import { recordFetchOutcome } from "../../indexing/index-retailer-summary";
import {
  getProxyPool,
  getUndiciDispatcher,
  pickProxyRoute,
  proxyRedacted,
} from "../../net/proxy-routing";
import { recordBandwidth } from "../../retailers/health/bandwidth-metrics";
import {
  recordFallbackToDirect,
  recordProxyFailure,
  recordProxyRetry,
  recordRouteSelection,
  recordSelectedEndpoint,
} from "../../net/proxy-observability";
import { recordIngestionAttempt } from "../../retailers/health/ingestion-efficiency";
import {
  classifyRetailerResponse,
  type ResponseClassification,
} from "../../net/response-classification";
import { saveExtractionArtifact } from "../../retailers/extraction-artifacts";
import { getRetailerFetchStrategy } from "../../retailers/fetch-strategy";

const DEFAULT_USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

const RETAILER_TIMEOUT_MS: Partial<Record<RetailerId, number>> = {
  walmart: 18_000,
  costco: 20_000,
  kroger: 18_000,
  amazon: 15_000,
  target: 15_000,
};

let proxyRotateIndex = 0;
let uaRotateIndex = 0;

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function userAgentPool(): string[] {
  const fromEnv = parseList(process.env.INDEX_USER_AGENT_POOL);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_USER_AGENTS;
}

export function proxyUrlPool(): string[] {
  return getProxyPool();
}

/** Reject doc placeholders and malformed proxy URLs. */
export function isValidProxyUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (/USER:PASS|@proxy:PORT|your-residential|proxy\.example/i.test(u)) return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

let warnedInvalidProxy = false;

export function warnIfProxyMisconfigured(): void {
  if (warnedInvalidProxy) return;
  const rawList = parseList(process.env.INDEX_PROXY_LIST);
  const rawSingle = process.env.INDEX_PROXY_URL?.trim();
  const raw = rawList.length > 0 ? rawList : rawSingle ? [rawSingle] : [];
  if (!raw.length) return;
  const invalid = raw.filter((u) => !isValidProxyUrl(u));
  if (invalid.length > 0) {
    warnedInvalidProxy = true;
    console.warn(
      "[retailer-fetch] INDEX_PROXY_LIST / INDEX_PROXY_URL contains invalid placeholder URLs — ignoring proxy. Use a real URL like http://user:pass@gate.provider.com:12345",
    );
  }
}

export function pickUserAgent(seed?: string): string {
  const pool = userAgentPool();
  if (seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    return pool[Math.abs(h) % pool.length]!;
  }
  const ua = pool[uaRotateIndex % pool.length]!;
  uaRotateIndex += 1;
  return ua;
}

export function pickProxyUrl(
  seed?: string,
  retailerId?: RetailerId,
): string | undefined {
  warnIfProxyMisconfigured();
  if (retailerId && !shouldUseProxyForRetailer(retailerId)) {
    const forceAll = process.env.INDEX_PROXY_FORCE_ALL === "1";
    if (!forceAll) return undefined;
  }
  const pool = proxyUrlPool();
  if (!pool.length) return undefined;
  if (seed && pool.length > 1) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    return pool[Math.abs(h) % pool.length];
  }
  const proxy = pool[proxyRotateIndex % pool.length]!;
  proxyRotateIndex += 1;
  return proxy;
}

export function fetchTimeoutMs(retailerId: RetailerId): number {
  const key = `INDEX_FETCH_TIMEOUT_${retailerId.toUpperCase()}_MS`;
  const env = process.env[key]?.trim();
  if (env) {
    const n = parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const raw = process.env.INDEX_FETCH_TIMEOUT_MS?.trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return RETAILER_TIMEOUT_MS[retailerId] ?? 12_000;
}

export function maxFetchAttempts(retailerId: RetailerId): number {
  const profile = getRetailerFetchProfile(retailerId);
  if (profile.maxAttempts) return profile.maxAttempts;
  const raw = process.env.INDEX_FETCH_ATTEMPTS?.trim();
  const base = raw ? parseInt(raw, 10) : NaN;
  const n = Number.isFinite(base) && base > 0 ? base : retailerId === "amazon" ? 3 : 2;
  return Math.min(n, 5);
}

export function isWalmartBlockedHtml(html: string): boolean {
  if (html.length < 1500 && !/"usItemId"|itemStacks/i.test(html)) return true;
  return /blocked|robot|captcha|perimeterx|px-captcha|unusual traffic|access denied|verify you are human|security check/i.test(
    html,
  );
}

export function isAmazonBlockedHtml(html: string): boolean {
  if (html.length < 2500 && !/data-asin=["'][A-Z0-9]{10}/i.test(html)) {
    return true;
  }
  return /captcha|robot check|api-services-support@amazon|sorrysomethingwentwrong|enter the characters you see|automated access/i.test(
    html,
  );
}

export function isTargetBlockedHtml(html: string): boolean {
  return /access denied|captcha|robot check|blocked|perimeterx|px-captcha|unusual traffic/i.test(
    html,
  );
}

export function isRetailerBlockedHtml(
  retailerId: RetailerId,
  html: string,
  statusOk: boolean,
): boolean {
  if (!statusOk) return true;
  if (retailerId === "amazon") return isAmazonBlockedHtml(html);
  if (retailerId === "walmart") return isWalmartBlockedHtml(html);
  if (retailerId === "target") return isTargetBlockedHtml(html);
  if (html.length < 400) return true;
  if (/access denied|request blocked|cf-browser-verification|please enable cookies/i.test(html)) {
    return true;
  }
  return false;
}

export interface RetailerHtmlFetchResult {
  html: string;
  resolvedUrl: string;
  userAgent: string;
  /** True only when the response came through a working proxy connection. */
  proxyUsed: boolean;
  attempt: number;
  status: number;
}

export interface RetailerFetchFailure {
  retailerId: RetailerId;
  url: string;
  status?: number;
  reason: string;
  attempt: number;
  proxyUsed: boolean;
  /** Structured anti-bot classification when available. */
  classification?: ResponseClassification;
}

interface SimpleHttpResponse {
  ok: boolean;
  status: number;
  url: string;
  headers: Record<string, string>;
  text: () => Promise<string>;
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function buildHeaders(retailerId: RetailerId, userAgent: string): Record<string, string> {
  const profile = getRetailerFetchProfile(retailerId);
  return {
    "User-Agent": userAgent,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    ...profile.extraHeaders,
  };
}

async function fetchWithOptionalProxy(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  retailerId: RetailerId,
  attempt: number,
  proxyUrl?: string,
): Promise<{ response: SimpleHttpResponse; viaProxy: boolean }> {
  if (proxyUrl && isValidProxyUrl(proxyUrl)) {
    try {
      const { fetch: proxyFetch } = await import("undici");
      const dispatcher = await getUndiciDispatcher(proxyUrl);
      const res = await proxyFetch(url, {
        headers,
        dispatcher,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      return {
        response: {
          ok: res.ok,
          status: res.status,
          url: res.url,
          headers: headersToObject(res.headers as unknown as Headers),
          text: () => res.text(),
        },
        viaProxy: true,
      };
    } catch (e) {
      recordProxyFailure(retailerId, String(e));
      recordFallbackToDirect(retailerId);
      if (attempt > 1) recordProxyRetry(retailerId);
      if (process.env.PIPELINE_DEBUG === "1" || process.env.INDEX_FETCH_LOG === "1") {
        console.warn(
          "[retailer-fetch] proxy failed, falling back to direct",
          proxyRedacted(proxyUrl),
          String(e).slice(0, 80),
        );
      }
    }
  }

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  return {
    response: {
      ok: res.ok,
      status: res.status,
      url: res.url,
      headers: headersToObject(res.headers),
      text: () => res.text(),
    },
    viaProxy: false,
  };
}

async function maybeSaveDebugHtml(
  retailerId: RetailerId,
  html: string,
  tag: string,
): Promise<void> {
  if (process.env.INDEX_SAVE_FETCH_HTML !== "1") return;
  try {
    const dir = join(process.cwd(), ".scratch", "retailer-html");
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${retailerId}-${tag}-${Date.now()}.html`);
    await writeFile(file, html.slice(0, 500_000), "utf8");
    console.log("[retailer-fetch] saved html", file);
  } catch {
    /* non-fatal */
  }
}

/** Fetch retailer HTML with rotating UA + optional residential proxy. */
export async function fetchRetailerHtml(
  pageUrl: string,
  retailerId: RetailerId,
  attempt = 1,
): Promise<RetailerHtmlFetchResult | null> {
  const startedAt = Date.now();
  const seed = `${pageUrl}:${attempt}`;
  const userAgent = pickUserAgent(seed);
  const route = pickProxyRoute({ retailerId, seed, attempt });
  const proxyUrl = route.proxyUrl;
  recordSelectedEndpoint(retailerId, proxyRedacted(proxyUrl), attempt);
  const timeoutMs = fetchTimeoutMs(retailerId);
  const headers = buildHeaders(retailerId, userAgent);

  try {
    const { response: res, viaProxy } = await fetchWithOptionalProxy(
      pageUrl,
      headers,
      timeoutMs,
      retailerId,
      attempt,
      proxyUrl,
    );

    if (!res.ok) {
      const errorHtml = await res.text().catch(() => "");
      const classification = classifyRetailerResponse({
        retailerId,
        status: res.status,
        html: errorHtml,
        headers: res.headers,
      });
      await saveExtractionArtifact({
        retailerId,
        url: pageUrl,
        status: res.status,
        html: errorHtml,
        headers: res.headers,
        classification,
        method: getRetailerFetchStrategy(retailerId).method,
        proxyUsed: viaProxy,
        proxyEndpoint: proxyRedacted(proxyUrl),
        attempt,
      });
      const failure: RetailerFetchFailure = {
        retailerId,
        url: pageUrl,
        status: res.status,
        reason: classification.reason,
        attempt,
        proxyUsed: viaProxy,
        classification,
      };
      logFetchFailure(failure);
      recordFetchOutcome(failure, retailerId, viaProxy);
      recordBandwidth(retailerId, {
        bytes: Buffer.byteLength(errorHtml, "utf8"),
        viaProxy,
        ok: false,
      });
      recordIngestionAttempt({
        retailerId,
        productKey: pageUrl,
        ok: false,
        viaProxy,
        blocked: classification.category !== "http_error",
        bytes: Buffer.byteLength(errorHtml, "utf8"),
        latencyMs: Date.now() - startedAt,
      });
      return null;
    }

    const html = await res.text();
    const classification = classifyRetailerResponse({
      retailerId,
      status: res.status,
      html,
      headers: res.headers,
    });
    const bytes = classification.bytes;

    if (!classification.ok) {
      const reason = classification.reason;
      await maybeSaveDebugHtml(retailerId, html, reason);
      await saveExtractionArtifact({
        retailerId,
        url: pageUrl,
        status: res.status,
        html,
        headers: res.headers,
        classification,
        method: getRetailerFetchStrategy(retailerId).method,
        proxyUsed: viaProxy,
        proxyEndpoint: proxyRedacted(proxyUrl),
        attempt,
      });
      const failure: RetailerFetchFailure = {
        retailerId,
        url: pageUrl,
        status: res.status,
        reason,
        attempt,
        proxyUsed: viaProxy,
        classification,
      };
      logFetchFailure(failure);
      recordFetchOutcome(failure, retailerId, viaProxy);
      recordBandwidth(retailerId, { bytes, viaProxy, ok: false });
      recordIngestionAttempt({
        retailerId,
        productKey: pageUrl,
        ok: false,
        blocked: true,
        viaProxy,
        bytes,
        latencyMs: Date.now() - startedAt,
      });
      return null;
    }

    if (html.length < 200) {
      const failure: RetailerFetchFailure = {
        retailerId,
        url: pageUrl,
        status: res.status,
        reason: "html-too-short",
        attempt,
        proxyUsed: viaProxy,
      };
      recordFetchOutcome(failure, retailerId, viaProxy);
      recordBandwidth(retailerId, { bytes, viaProxy, ok: false });
      recordIngestionAttempt({
        retailerId,
        productKey: pageUrl,
        ok: false,
        blocked: false,
        viaProxy,
        bytes,
        latencyMs: Date.now() - startedAt,
      });
      return null;
    }

    recordFetchOutcome(null, retailerId, viaProxy);
    recordBandwidth(retailerId, { bytes, viaProxy, ok: true });
    recordIngestionAttempt({
      retailerId,
      productKey: pageUrl,
      ok: true,
      blocked: false,
      viaProxy,
      bytes,
      latencyMs: Date.now() - startedAt,
    });

    return {
      html,
      resolvedUrl: res.url || pageUrl,
      userAgent,
      proxyUsed: viaProxy,
      attempt,
      status: res.status,
    };
  } catch (e) {
    const failure: RetailerFetchFailure = {
      retailerId,
      url: pageUrl,
      reason: `network-${String(e).slice(0, 80)}`,
      attempt,
      proxyUsed: Boolean(proxyUrl),
    };
    logFetchFailure(failure);
    recordFetchOutcome(failure, retailerId, Boolean(proxyUrl));
    recordBandwidth(retailerId, { bytes: 0, viaProxy: Boolean(proxyUrl), ok: false });
    recordIngestionAttempt({
      retailerId,
      productKey: pageUrl,
      ok: false,
      blocked: false,
      viaProxy: Boolean(proxyUrl),
      bytes: 0,
      latencyMs: Date.now() - startedAt,
    });
    return null;
  }
}

export function logFetchFailure(f: RetailerFetchFailure): void {
  if (process.env.PIPELINE_DEBUG !== "1" && process.env.INDEX_FETCH_LOG !== "1") return;
  console.warn("[retailer-fetch-fail]", {
    retailer: f.retailerId,
    status: f.status,
    reason: f.reason,
    category: f.classification?.category,
    vendor: f.classification?.vendor,
    indicators: f.classification?.indicators,
    attempt: f.attempt,
    proxy: f.proxyUsed,
    url: f.url.slice(0, 80),
    hint:
      f.retailerId === "walmart" && !f.proxyUsed ?
        "Set INDEX_PROXY_LIST to a real residential proxy URL (not USER:PASS@proxy:PORT placeholder)"
      : f.reason === "http-403" ?
        "403 — try INDEX_PROXY_RETAILERS=walmart,target,kroger,costco with a valid proxy"
      : undefined,
  });
}

/** Retry fetch with fresh UA/proxy rotation, then escalate to rendered. */
export async function fetchRetailerHtmlWithRetries(
  pageUrl: string,
  retailerId: RetailerId,
): Promise<RetailerHtmlFetchResult | null> {
  if (process.env.ACQUISITION_ORCHESTRATOR === "1" || process.env.INDEX_USE_ACQUISITION_ORCHESTRATOR === "1") {
    const { acquireRetailerPage } = await import("../../retailers/acquisition/orchestrator");
    const result = await acquireRetailerPage({ retailerId, url: pageUrl });
    if (result.ok && result.html) {
      return {
        html: result.html,
        resolvedUrl: pageUrl,
        userAgent: "orchestrator",
        status: result.status || 200,
        proxyUsed: result.transport === "datacenter" || result.transport === "residential",
        attempt: result.strategyAttempts.length,
      };
    }
  }

  const attempts = maxFetchAttempts(retailerId);
  for (let i = 1; i <= attempts; i++) {
    const seed = `${pageUrl}:${i}`;
    const route = pickProxyRoute({ retailerId, seed, attempt: i });
    recordRouteSelection(retailerId, route.mode);
    const row = await fetchRetailerHtml(pageUrl, retailerId, i);
    if (row) return row;
    if (i < attempts) recordProxyRetry(retailerId);
  }

  // Escalate to the rendered (Playwright) executor when the HTTP path is
  // exhausted and the retailer's strategy permits it. Env-gated + lazy-imported
  // so normal flows never require browsers.
  const rendered = await tryRenderedEscalation(pageUrl, retailerId);
  if (rendered) return rendered;

  return null;
}

async function tryRenderedEscalation(
  pageUrl: string,
  retailerId: RetailerId,
): Promise<RetailerHtmlFetchResult | null> {
  try {
    const { isRenderedFetchEnabled, strategyAllowsRendered, fetchRenderedHtml } = await import(
      "./rendered-fetch"
    );
    if (!isRenderedFetchEnabled() || !strategyAllowsRendered(retailerId)) return null;

    const { buildEscalationLadder } = await import("../../retailers/escalation-policy");
    const { newStickySessionId } = await import("../../net/proxy-routing");

    // Transport-first ladder: cheapest transport before behavioral escalation.
    const ladder = buildEscalationLadder({ retailerId, suspicion: 0 });
    for (let i = 0; i < ladder.length; i++) {
      const step = ladder[i]!;
      if (process.env.PIPELINE_DEBUG === "1" || process.env.INDEX_FETCH_LOG === "1") {
        console.warn(
          `[retailer-fetch] rendered escalation ${retailerId}: ${step.transport}+${step.behavior}`,
        );
      }
      const result = await fetchRenderedHtml(pageUrl, retailerId, {
        transport: step.transport,
        behaviorId: step.behavior,
        stickySessionId: step.transport === "residential" ? newStickySessionId() : undefined,
        attempt: i + 1,
      });
      // Skip unconfigured transports without aborting the ladder.
      if (result.error?.includes("not_configured")) continue;
      if (result.ok && result.html) {
        return {
          html: result.html,
          resolvedUrl: result.finalUrl ?? pageUrl,
          userAgent: "playwright",
          proxyUsed: result.proxyUsed,
          attempt: attempts(retailerId) + i + 1,
          status: result.status,
        };
      }
    }
    return null;
  } catch (e) {
    if (process.env.PIPELINE_DEBUG === "1") {
      console.warn("[retailer-fetch] rendered escalation failed", String(e).slice(0, 120));
    }
    return null;
  }
}

function attempts(retailerId: RetailerId): number {
  return maxFetchAttempts(retailerId);
}
