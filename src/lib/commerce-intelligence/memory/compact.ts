import { loadStructuredMemory } from "./store";
import type { MemoryStoreFile } from "./types";
import { MEMORY_TTL_DAYS, type MemoryLayer } from "./types";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { intelligenceOpsConfig } from "../ops/config";
import { intelligenceGraphDir } from "../storage-root";

const MEMORY_PATH = join(intelligenceGraphDir(), "structured-memory.json");

function pruneExpired(store: MemoryStoreFile): MemoryStoreFile {
  const now = Date.now();
  store.entries = store.entries.filter((e) => {
    if (!e.expiresAt) return true;
    return new Date(e.expiresAt).getTime() > now;
  });
  return store;
}

function capLayer(store: MemoryStoreFile, layer: MemoryLayer, max: number): void {
  const layerEntries = store.entries
    .filter((e) => e.layer === layer)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (layerEntries.length <= max) return;
  const drop = new Set(layerEntries.slice(max).map((e) => e.key));
  store.entries = store.entries.filter((e) => e.layer !== layer || !drop.has(e.key));
}

/** Decay behavioral weights — never affects factual/trust layers. */
function decayBehavioralWeights(store: MemoryStoreFile): void {
  for (const e of store.entries) {
    if (e.layer !== "behavioral") continue;
    e.weight = Math.max(0.1, Math.round(e.weight * 0.95 * 1000) / 1000);
  }
}

export interface MemoryCompactionResult {
  beforeCount: number;
  afterCount: number;
  prunedExpired: number;
  cappedLayers: Record<string, number>;
}

export function compactStructuredMemory(): MemoryCompactionResult {
  const store = pruneExpired(loadStructuredMemory());
  const beforeCount = store.entries.length;

  const seen = new Map<string, number>();
  const deduped: typeof store.entries = [];
  for (const e of store.entries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )) {
    const k = `${e.layer}:${e.key}`;
    if (seen.has(k)) continue;
    seen.set(k, 1);
    deduped.push(e);
  }
  store.entries = deduped;

  decayBehavioralWeights(store);

  const max = intelligenceOpsConfig.maxMemoryEntriesPerLayer;
  const cappedLayers: Record<string, number> = {};
  for (const layer of Object.keys(MEMORY_TTL_DAYS) as MemoryLayer[]) {
    const before = store.entries.filter((e) => e.layer === layer).length;
    capLayer(store, layer, max);
    const after = store.entries.filter((e) => e.layer === layer).length;
    if (before > after) cappedLayers[layer] = before - after;
  }

  store.updatedAt = new Date().toISOString();
  mkdirSync(intelligenceGraphDir(), { recursive: true });
  writeFileSync(MEMORY_PATH, JSON.stringify(store, null, 2));

  return {
    beforeCount,
    afterCount: store.entries.length,
    prunedExpired: Math.max(0, beforeCount - deduped.length),
    cappedLayers,
  };
}
