import "server-only";

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();

export const PRODUCT_SEARCH_TTL_MS = 10 * 60 * 1000;
export const PRODUCT_DETAIL_TTL_MS = 30 * 60 * 1000;
export const PRODUCT_OFFER_TTL_MS = 10 * 60 * 1000;

export function getCached<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() >= hit.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): T {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function cacheKey(...parts: Array<string | number | undefined>) {
  return parts
    .map((part) => String(part ?? "").trim().toLowerCase())
    .join(":");
}
