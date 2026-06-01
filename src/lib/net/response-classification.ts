import type { RetailerId } from "../types";
import signatures from "./anti-bot-signatures.json";

/**
 * Structured classification of a retailer response so blocked reasons are
 * explicit (interstitial vs CAPTCHA vs login-wall vs JS-challenge vs HTTP
 * error) rather than a single opaque "blocked" boolean. Shared catalog lives
 * in anti-bot-signatures.json (also read by scripts/response-classify.mjs).
 */
export type BlockCategory =
  | "ok"
  | "captcha"
  | "interstitial"
  | "js_challenge"
  | "login_wall"
  | "rate_limited"
  | "access_denied"
  | "http_error"
  | "empty"
  | "suspicious";

export interface ResponseClassification {
  ok: boolean;
  category: BlockCategory;
  /** Short stable slug, e.g. "captcha:perimeterx" or "http_403". */
  reason: string;
  vendor?: string;
  /** 0..1 — how confident we are this is a block (or that it's OK). */
  confidence: number;
  /** Human-readable signals that matched. */
  indicators: string[];
  status: number;
  bytes: number;
}

interface HtmlSignature {
  id: string;
  vendor: string | null;
  category: BlockCategory;
  weight: number;
  pattern: string;
}

interface HeaderSignature {
  id: string;
  vendor: string | null;
  category: BlockCategory;
  header: string;
  pattern: string;
  weight?: number;
}

const HTML_SIGNATURES = signatures.htmlSignatures as HtmlSignature[];
const HEADER_SIGNATURES = signatures.headerSignatures as HeaderSignature[];
const PRODUCT_MARKERS = signatures.productMarkers as Record<string, string>;

const compiledHtml = HTML_SIGNATURES.map((s) => ({ ...s, re: new RegExp(s.pattern, "i") }));
const compiledHeader = HEADER_SIGNATURES.map((s) => ({ ...s, re: new RegExp(s.pattern, "i") }));

function headerValue(headers: Record<string, string> | Headers | undefined, key: string): string {
  if (!headers) return "";
  if (headers instanceof Headers) return headers.get(key) ?? "";
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return "";
}

export interface ClassifyInput {
  retailerId?: RetailerId;
  status: number;
  html: string;
  headers?: Record<string, string> | Headers;
  /** Below this byte count (and with no product markers) → empty/suspicious. */
  minOkBytes?: number;
}

export function classifyRetailerResponse(input: ClassifyInput): ResponseClassification {
  const { retailerId, status, html, headers } = input;
  const bytes = Buffer.byteLength(html ?? "", "utf8");
  const minOkBytes = input.minOkBytes ?? 800;
  const indicators: string[] = [];

  let best: { category: BlockCategory; vendor: string | null; weight: number; id: string } | null =
    null;

  for (const sig of compiledHtml) {
    if (sig.re.test(html)) {
      indicators.push(`html:${sig.id}`);
      if (!best || sig.weight > best.weight) {
        best = { category: sig.category, vendor: sig.vendor, weight: sig.weight, id: sig.id };
      }
    }
  }

  for (const sig of compiledHeader) {
    const val = headerValue(headers, sig.header);
    if (val && sig.re.test(val)) {
      indicators.push(`header:${sig.id}`);
      // Header presence (e.g. server: cloudflare) is weak on its own; only
      // promote to a block if HTML also looks non-product, handled below.
      const weight = sig.weight ?? 0.4;
      if (!best || weight > best.weight) {
        best = { category: sig.category, vendor: sig.vendor, weight, id: sig.id };
      }
    }
  }

  const hasProductMarker =
    retailerId && PRODUCT_MARKERS[retailerId]
      ? new RegExp(PRODUCT_MARKERS[retailerId], "i").test(html)
      : false;

  // HTTP-level outcomes take precedence and pin the reason slug.
  if (status === 429) {
    return mk("rate_limited", best?.vendor ?? null, "http_429", 0.95, indicators, status, bytes);
  }
  if (status === 403) {
    const vendor = best?.vendor ?? null;
    const cat = best?.category && best.category !== "ok" ? best.category : "access_denied";
    return mk(cat, vendor, `http_403${vendor ? `:${vendor}` : ""}`, 0.95, indicators, status, bytes);
  }
  if (status === 401) {
    return mk("login_wall", null, "http_401", 0.85, indicators, status, bytes);
  }
  if (status >= 500) {
    return mk("http_error", null, `http_${status}`, 0.9, indicators, status, bytes);
  }
  if (status >= 400) {
    return mk("http_error", best?.vendor ?? null, `http_${status}`, 0.8, indicators, status, bytes);
  }

  // status is 2xx/3xx from here.
  if (best && best.weight >= 0.6 && !hasProductMarker) {
    const reason = best.vendor ? `${best.category}:${best.vendor}` : best.category;
    return mk(best.category, best.vendor, reason, best.weight, indicators, status, bytes);
  }

  if (!hasProductMarker && bytes < minOkBytes) {
    return mk("empty", null, "empty_or_too_short", 0.7, indicators, status, bytes);
  }

  // Weak login-wall / js-required hint with no product markers → suspicious.
  if (best && !hasProductMarker && best.weight >= 0.35) {
    const reason = best.vendor ? `${best.category}:${best.vendor}` : best.category;
    return mk("suspicious", best.vendor, `suspicious:${reason}`, best.weight, indicators, status, bytes);
  }

  return mk("ok", null, "ok", hasProductMarker ? 0.95 : 0.7, indicators, status, bytes);
}

function mk(
  category: BlockCategory,
  vendor: string | null,
  reason: string,
  confidence: number,
  indicators: string[],
  status: number,
  bytes: number,
): ResponseClassification {
  return {
    ok: category === "ok",
    category,
    reason,
    vendor: vendor ?? undefined,
    confidence: Math.round(confidence * 100) / 100,
    indicators,
    status,
    bytes,
  };
}

export function isBlockedClassification(c: ResponseClassification): boolean {
  return c.category !== "ok";
}

/**
 * Whether the HTML contains a retailer's product-listing marker. Used by the
 * rendered executor's readiness loop to decide that a partially-loaded DOM is
 * already extractable (so we can stop waiting on a stalled lifecycle).
 */
export function hasProductMarker(retailerId: string | undefined, html: string): boolean {
  if (!retailerId) return false;
  const marker = PRODUCT_MARKERS[retailerId];
  if (!marker) return false;
  return new RegExp(marker, "i").test(html);
}
