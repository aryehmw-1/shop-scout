import type { RetailerId } from "@/lib/types";
import type { TrustMemoryEventType, TrustMemoryStore } from "./types";

const STORAGE_KEY = "shop-scout-trust-memory-v1";
const MAX_BOOST = 0.04;

export function emptyTrustMemory(): TrustMemoryStore {
  return { version: 1, updatedAt: new Date().toISOString(), retailers: {}, canonicals: {} };
}

export function loadTrustMemory(): TrustMemoryStore {
  if (typeof window === "undefined") return emptyTrustMemory();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyTrustMemory();
    const parsed = JSON.parse(raw) as TrustMemoryStore;
    if (parsed.version !== 1) return emptyTrustMemory();
    return parsed;
  } catch {
    return emptyTrustMemory();
  }
}

export function saveTrustMemory(store: TrustMemoryStore): void {
  if (typeof window === "undefined") return;
  store.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function recordTrustMemoryEvent(opts: {
  type: TrustMemoryEventType;
  retailer: RetailerId;
  canonicalId?: string;
}): TrustMemoryStore {
  const store = loadTrustMemory();
  const r = store.retailers[opts.retailer] ?? {
    clicks: 0,
    saves: 0,
    ignores: 0,
    reversals: 0,
  };

  if (opts.type === "click") r.clicks++;
  else if (opts.type === "save") r.saves++;
  else if (opts.type === "ignore") r.ignores++;
  else if (opts.type === "reversal") r.reversals++;

  store.retailers[opts.retailer] = r;

  if (opts.canonicalId) {
    const c = store.canonicals[opts.canonicalId] ?? { clicks: 0, saves: 0, ignores: 0 };
    if (opts.type === "click") c.clicks++;
    else if (opts.type === "save") c.saves++;
    else if (opts.type === "ignore") c.ignores++;
    store.canonicals[opts.canonicalId] = c;
  }

  saveTrustMemory(store);
  return store;
}

/** Weak ranking influence only — capped, never affects confidence scores. */
export function trustMemoryRankingBoost(
  retailer: RetailerId,
  canonicalId?: string,
): { boost: number; note: string | null } {
  const store = loadTrustMemory();
  const r = store.retailers[retailer];
  if (!r) return { boost: 0, note: null };

  let boost = 0;
  if (r.saves >= 2) boost += 0.02;
  if (r.clicks >= 5) boost += 0.01;
  if (r.ignores >= 5) boost -= 0.02;
  if (r.reversals >= 2) boost -= 0.015;

  if (canonicalId && store.canonicals[canonicalId]?.saves >= 1) {
    boost += 0.01;
  }

  boost = Math.max(-0.02, Math.min(MAX_BOOST, boost));
  const note =
    boost > 0 ?
      "Your recent store preferences lightly influenced display order (not prices or confidence)."
    : boost < 0 ?
      "Stores you often skip were slightly deprioritized in display order."
    : null;

  return { boost, note };
}
