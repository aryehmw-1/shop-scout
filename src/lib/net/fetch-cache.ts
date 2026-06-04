import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

/**
 * F — persistent fetch cache with conditional revalidation.
 *
 * Stores per-URL validators (ETag / Last-Modified) plus a content hash and a
 * freshness TTL. On the next fetch we can:
 *   - serve from cache while fresh (TTL not expired) → zero network
 *   - revalidate with If-None-Match / If-Modified-Since when stale → cheap 304
 *   - detect product changes via content-hash diff
 *
 * This is the long-term bandwidth lever: avoid re-downloading unchanged pages.
 */
const CACHE_ROOT = join(process.cwd(), "artifacts", "fetch-cache");

export interface CacheEntry {
  url: string;
  etag?: string;
  lastModified?: string;
  contentHash: string;
  bytes: number;
  fetchedAt: string;
  /** seconds */
  ttl: number;
}

export interface ConditionalHeaders {
  "If-None-Match"?: string;
  "If-Modified-Since"?: string;
}

function keyFor(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

function entryPath(url: string): string {
  const k = keyFor(url);
  return join(CACHE_ROOT, k.slice(0, 2), `${k}.json`);
}

export function hashContent(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export async function readCacheEntry(url: string): Promise<CacheEntry | null> {
  try {
    const raw = await readFile(entryPath(url), "utf8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

export function isFresh(entry: CacheEntry, now = Date.now()): boolean {
  const age = (now - new Date(entry.fetchedAt).getTime()) / 1000;
  return age < entry.ttl;
}

/** Build conditional request headers from a cache entry (for revalidation). */
export function conditionalHeaders(entry: CacheEntry | null): ConditionalHeaders {
  if (!entry) return {};
  const h: ConditionalHeaders = {};
  if (entry.etag) h["If-None-Match"] = entry.etag;
  if (entry.lastModified) h["If-Modified-Since"] = entry.lastModified;
  return h;
}

export async function writeCacheEntry(input: {
  url: string;
  body: string;
  etag?: string;
  lastModified?: string;
  ttl?: number;
}): Promise<CacheEntry> {
  const entry: CacheEntry = {
    url: input.url,
    etag: input.etag,
    lastModified: input.lastModified,
    contentHash: hashContent(input.body),
    bytes: Buffer.byteLength(input.body, "utf8"),
    fetchedAt: new Date().toISOString(),
    ttl: input.ttl ?? defaultTtlSeconds(),
  };
  try {
    const p = entryPath(input.url);
    await mkdir(join(p, ".."), { recursive: true });
    await writeFile(p, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    /* non-fatal — cache is best-effort */
  }
  return entry;
}

/** Bump validators after a 304 (content unchanged) so freshness window resets. */
export async function touchCacheEntry(entry: CacheEntry): Promise<CacheEntry> {
  const next = { ...entry, fetchedAt: new Date().toISOString() };
  try {
    await writeFile(entryPath(entry.url), `${JSON.stringify(next)}\n`, "utf8");
  } catch {
    /* non-fatal */
  }
  return next;
}

export function defaultTtlSeconds(): number {
  const raw = process.env.INDEX_CACHE_TTL_SECONDS?.trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 6 * 60 * 60; // 6h default
}

export function cacheRoot(): string {
  return CACHE_ROOT;
}

/**
 * Decide what to do for a URL given its cache entry.
 * - "fresh": serve cache, no network
 * - "revalidate": conditional request needed (send conditionalHeaders)
 * - "miss": no entry, full fetch
 */
export function cacheDecision(entry: CacheEntry | null): "fresh" | "revalidate" | "miss" {
  if (!entry) return "miss";
  if (isFresh(entry)) return "fresh";
  return "revalidate";
}
