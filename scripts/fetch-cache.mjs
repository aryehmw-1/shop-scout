/**
 * Standalone persistent fetch cache for scripts. Mirrors
 * src/lib/net/fetch-cache.ts entry format so simulate:nightly demonstrates
 * real ETag/Last-Modified revalidation and cache hits across runs.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_ROOT = resolve(__dirname, "..", "artifacts", "fetch-cache");

function keyFor(url) {
  return createHash("sha1").update(url).digest("hex");
}
function entryPath(url) {
  const k = keyFor(url);
  return join(CACHE_ROOT, k.slice(0, 2), `${k}.json`);
}
export function hashContent(body) {
  return createHash("sha256").update(body).digest("hex");
}
export function defaultTtlSeconds() {
  const raw = process.env.INDEX_CACHE_TTL_SECONDS?.trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 6 * 60 * 60;
}
export function readCacheEntry(url) {
  try {
    return JSON.parse(readFileSync(entryPath(url), "utf8"));
  } catch {
    return null;
  }
}
export function isFresh(entry, now = Date.now()) {
  const age = (now - new Date(entry.fetchedAt).getTime()) / 1000;
  return age < entry.ttl;
}
export function cacheDecision(entry) {
  if (!entry) return "miss";
  return isFresh(entry) ? "fresh" : "revalidate";
}
export function conditionalHeaders(entry) {
  if (!entry) return {};
  const h = {};
  if (entry.etag) h["If-None-Match"] = entry.etag;
  if (entry.lastModified) h["If-Modified-Since"] = entry.lastModified;
  return h;
}
export function writeCacheEntry({ url, body, etag, lastModified, ttl }) {
  const entry = {
    url,
    etag,
    lastModified,
    contentHash: hashContent(body),
    bytes: Buffer.byteLength(body, "utf8"),
    fetchedAt: new Date().toISOString(),
    ttl: ttl ?? defaultTtlSeconds(),
  };
  try {
    const p = entryPath(url);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    /* best-effort */
  }
  return entry;
}
export function touchCacheEntry(entry) {
  const next = { ...entry, fetchedAt: new Date().toISOString() };
  try {
    writeFileSync(entryPath(entry.url), `${JSON.stringify(next)}\n`, "utf8");
  } catch {
    /* best-effort */
  }
  return next;
}
export { CACHE_ROOT };
