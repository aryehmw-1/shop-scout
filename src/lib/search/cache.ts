import type { ProductSearchResults } from "../types";
import type { ShoppingIntent } from "../types";

interface CacheEntry {
  results: ProductSearchResults;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 500;

const store = new Map<string, CacheEntry>();

function stableIntentKey(intent: ShoppingIntent, mode: string): string {
  const parts = [
    mode,
    intent.zipCode ?? "",
    intent.query.trim().toLowerCase(),
    intent.category ?? "",
    intent.gender ?? "",
    intent.ageGroup ?? "",
    intent.brand ?? "",
    (intent.colors ?? []).join(","),
    intent.size ?? "",
    String(intent.maxPrice ?? ""),
    String(intent.organic ?? ""),
    "img-v2",
    "prices-v1",
    "age-v1",
  ];
  return parts.join("|");
}

export function getCachedSearch(
  intent: ShoppingIntent,
  mode: string,
): ProductSearchResults | null {
  const key = stableIntentKey(intent, mode);
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.results;
}

export function setCachedSearch(
  intent: ShoppingIntent,
  mode: string,
  results: ProductSearchResults,
  ttlMs = DEFAULT_TTL_MS,
): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(stableIntentKey(intent, mode), {
    results,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearSearchCache(): void {
  store.clear();
}
