import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AmazonEnrichmentCacheFile, AmazonEnrichmentEntry } from "./types";

const CACHE_FILE = join(process.cwd(), "data", "amazon-enrichment-cache.json");

export function loadEnrichmentCache(): AmazonEnrichmentCacheFile {
  if (!existsSync(CACHE_FILE)) {
    return { version: 1, updatedAt: new Date(0).toISOString(), entries: {} };
  }
  try {
    const raw = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as AmazonEnrichmentCacheFile;
    if (raw?.version === 1 && raw.entries) return raw;
  } catch {
    /* corrupt */
  }
  return { version: 1, updatedAt: new Date(0).toISOString(), entries: {} };
}

export function getCachedEnrichment(
  cacheKey: string,
  maxAgeMs = 7 * 24 * 60 * 60 * 1000,
): AmazonEnrichmentEntry | null {
  const cache = loadEnrichmentCache();
  const entry = cache.entries[cacheKey];
  if (!entry || entry.rejected) return null;
  const age = Date.now() - new Date(entry.fetchedAt).getTime();
  if (age > maxAgeMs) return null;
  return { ...entry, source: "cache" };
}

export function saveEnrichmentEntry(entry: AmazonEnrichmentEntry): void {
  const cache = loadEnrichmentCache();
  cache.entries[entry.cacheKey] = entry;
  cache.updatedAt = new Date().toISOString();
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

export function getEnrichmentCacheStats(): {
  total: number;
  accepted: number;
  rejected: number;
  updatedAt: string;
} {
  const cache = loadEnrichmentCache();
  const entries = Object.values(cache.entries);
  return {
    total: entries.length,
    accepted: entries.filter((e) => !e.rejected && e.enrichmentConfidence >= 0.55).length,
    rejected: entries.filter((e) => e.rejected).length,
    updatedAt: cache.updatedAt,
  };
}

export function getEnrichmentCachePath(): string {
  return CACHE_FILE;
}
