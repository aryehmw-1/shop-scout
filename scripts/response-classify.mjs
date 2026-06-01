/**
 * Standalone response classifier for node scripts (test:proxy, simulate:nightly).
 * Mirrors src/lib/net/response-classification.ts and reads the same signature
 * catalog (src/lib/net/anti-bot-signatures.json) so block reasons are
 * classified identically in scripts and in the app runtime.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(resolve(__dirname, "..", "src", "lib", "net", "anti-bot-signatures.json"), "utf8"),
);

const compiledHtml = catalog.htmlSignatures.map((s) => ({ ...s, re: new RegExp(s.pattern, "i") }));
const compiledHeader = catalog.headerSignatures.map((s) => ({ ...s, re: new RegExp(s.pattern, "i") }));
const productMarkers = catalog.productMarkers;

function headerValue(headers, key) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(key) ?? "";
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return Array.isArray(v) ? v.join("; ") : String(v);
  }
  return "";
}

function mk(category, vendor, reason, confidence, indicators, status, bytes) {
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

export function classifyRetailerResponse({ retailerId, status, html = "", headers, minOkBytes = 800 }) {
  const bytes = Buffer.byteLength(html, "utf8");
  const indicators = [];
  let best = null;

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
      const weight = sig.weight ?? 0.4;
      if (!best || weight > best.weight) {
        best = { category: sig.category, vendor: sig.vendor, weight, id: sig.id };
      }
    }
  }

  const marker = retailerId && productMarkers[retailerId];
  const hasProductMarker = marker ? new RegExp(marker, "i").test(html) : false;

  if (status === 429) return mk("rate_limited", best?.vendor ?? null, "http_429", 0.95, indicators, status, bytes);
  if (status === 403) {
    const vendor = best?.vendor ?? null;
    const cat = best?.category && best.category !== "ok" ? best.category : "access_denied";
    return mk(cat, vendor, `http_403${vendor ? `:${vendor}` : ""}`, 0.95, indicators, status, bytes);
  }
  if (status === 401) return mk("login_wall", null, "http_401", 0.85, indicators, status, bytes);
  if (status >= 500) return mk("http_error", null, `http_${status}`, 0.9, indicators, status, bytes);
  if (status >= 400) return mk("http_error", best?.vendor ?? null, `http_${status}`, 0.8, indicators, status, bytes);

  if (best && best.weight >= 0.6 && !hasProductMarker) {
    const reason = best.vendor ? `${best.category}:${best.vendor}` : best.category;
    return mk(best.category, best.vendor, reason, best.weight, indicators, status, bytes);
  }
  if (!hasProductMarker && bytes < minOkBytes) {
    return mk("empty", null, "empty_or_too_short", 0.7, indicators, status, bytes);
  }
  if (best && !hasProductMarker && best.weight >= 0.35) {
    const reason = best.vendor ? `${best.category}:${best.vendor}` : best.category;
    return mk("suspicious", best.vendor, `suspicious:${reason}`, best.weight, indicators, status, bytes);
  }
  return mk("ok", null, "ok", hasProductMarker ? 0.95 : 0.7, indicators, status, bytes);
}
