import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MemoryEntry, MemoryLayer, MemoryStoreFile } from "./types";
import { MEMORY_TTL_DAYS } from "./types";

const MEMORY_PATH = join(process.cwd(), "data", "intelligence-graph", "structured-memory.json");

function emptyStore(): MemoryStoreFile {
  return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
}

export function loadStructuredMemory(): MemoryStoreFile {
  if (!existsSync(MEMORY_PATH)) return emptyStore();
  try {
    return JSON.parse(readFileSync(MEMORY_PATH, "utf8")) as MemoryStoreFile;
  } catch {
    return emptyStore();
  }
}

function pruneExpired(store: MemoryStoreFile): MemoryStoreFile {
  const now = Date.now();
  store.entries = store.entries.filter((e) => {
    if (!e.expiresAt) return true;
    return new Date(e.expiresAt).getTime() > now;
  });
  return store;
}

export function upsertMemoryEntry(
  layer: MemoryLayer,
  key: string,
  value: unknown,
  opts?: { weight?: number; source?: string; ttlDays?: number | null },
): void {
  const store = pruneExpired(loadStructuredMemory());
  const ttl = opts?.ttlDays !== undefined ? opts.ttlDays : MEMORY_TTL_DAYS[layer];
  const expiresAt =
    ttl != null ?
      new Date(Date.now() + ttl * 86400000).toISOString()
    : undefined;

  const idx = store.entries.findIndex((e) => e.layer === layer && e.key === key);
  const entry: MemoryEntry = {
    key,
    layer,
    value,
    weight: opts?.weight ?? 1,
    createdAt: new Date().toISOString(),
    expiresAt,
    source: opts?.source ?? "system",
  };

  if (idx >= 0) store.entries[idx] = entry;
  else store.entries.push(entry);

  store.updatedAt = new Date().toISOString();
  mkdirSync(join(process.cwd(), "data", "intelligence-graph"), { recursive: true });
  writeFileSync(MEMORY_PATH, JSON.stringify(store, null, 2));
}

export function getMemoryByLayer(layer: MemoryLayer): MemoryEntry[] {
  return pruneExpired(loadStructuredMemory()).entries.filter((e) => e.layer === layer);
}

export function getMemoryValue<T>(layer: MemoryLayer, key: string): T | undefined {
  const hit = getMemoryByLayer(layer).find((e) => e.key === key);
  return hit?.value as T | undefined;
}
