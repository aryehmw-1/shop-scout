/**
 * Cache last successful acquisition path per retailer (method + transport).
 * Prefer cached path when retailer health is stable; downgrade when failures spike.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RetailerId } from "../../types";
import type { AcquisitionMethod } from "./types";
import type { TransportClass } from "./transport-policy";

const CACHE_FILE = join(process.cwd(), "artifacts", "ops", "acquisition-path-cache.json");

export interface CachedAcquisitionPath {
  retailerId: RetailerId;
  method: AcquisitionMethod;
  transport?: TransportClass;
  successCount: number;
  failureCount: number;
  lastSuccessAt: string;
  lastFailureAt?: string;
  avgConfidence: number;
}

type CacheStore = Record<string, CachedAcquisitionPath>;

async function loadCache(): Promise<CacheStore> {
  if (!existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8")) as CacheStore;
  } catch {
    return {};
  }
}

async function saveCache(store: CacheStore): Promise<void> {
  await mkdir(join(process.cwd(), "artifacts", "ops"), { recursive: true });
  await writeFile(CACHE_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function getCachedPath(retailerId: RetailerId): Promise<CachedAcquisitionPath | undefined> {
  const store = await loadCache();
  const row = store[retailerId];
  if (!row) return undefined;
  const failRate = row.failureCount / Math.max(row.successCount + row.failureCount, 1);
  if (failRate > 0.5) return undefined;
  return row;
}

export async function recordPathOutcome(input: {
  retailerId: RetailerId;
  method: AcquisitionMethod;
  transport?: TransportClass;
  ok: boolean;
  confidence: number;
}): Promise<void> {
  const store = await loadCache();
  const prev = store[input.retailerId];
  const now = new Date().toISOString();
  if (input.ok) {
    store[input.retailerId] = {
      retailerId: input.retailerId,
      method: input.method,
      transport: input.transport,
      successCount: (prev?.successCount ?? 0) + 1,
      failureCount: prev?.failureCount ?? 0,
      lastSuccessAt: now,
      lastFailureAt: prev?.lastFailureAt,
      avgConfidence: prev ?
        Math.round(((prev.avgConfidence * prev.successCount + input.confidence) / ((prev.successCount ?? 0) + 1)) * 1000) / 1000
      : input.confidence,
    };
  } else if (prev) {
    store[input.retailerId] = {
      ...prev,
      failureCount: prev.failureCount + 1,
      lastFailureAt: now,
    };
  }
  await saveCache(store);
}

export async function listCachedPaths(): Promise<CachedAcquisitionPath[]> {
  const store = await loadCache();
  return Object.values(store);
}
