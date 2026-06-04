import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RetailerId } from "@/lib/types";
import type { TrustMemoryEventType } from "../trust-memory/types";
import { intelligenceGraphDir } from "../storage-root";

/** Server-side behavioral aggregates — isolated from factual/trust scoring. */
export interface ServerBehavioralStore {
  version: 1;
  updatedAt: string;
  retailers: Partial<
    Record<
      RetailerId,
      {
        clicks: number;
        saves: number;
        ignores: number;
        reversals: number;
        repeatSelections: number;
      }
    >
  >;
  canonicals: Record<string, { clicks: number; saves: number; ignores: number }>;
}

const PATH = join(intelligenceGraphDir(), "behavioral-feedback.json");
const MAX_PER_RETAILER = 5000;

function empty(): ServerBehavioralStore {
  return { version: 1, updatedAt: new Date().toISOString(), retailers: {}, canonicals: {} };
}

export function loadServerBehavioralStore(): ServerBehavioralStore {
  if (!existsSync(PATH)) return empty();
  try {
    return JSON.parse(readFileSync(PATH, "utf8")) as ServerBehavioralStore;
  } catch {
    return empty();
  }
}

function save(store: ServerBehavioralStore): void {
  store.updatedAt = new Date().toISOString();
  mkdirSync(intelligenceGraphDir(), { recursive: true });
  writeFileSync(PATH, JSON.stringify(store, null, 2));
}

export function recordServerBehavioralEvent(opts: {
  type: TrustMemoryEventType | "repeat_select";
  retailer: RetailerId;
  canonicalId?: string;
}): ServerBehavioralStore {
  const store = loadServerBehavioralStore();
  const r = store.retailers[opts.retailer] ?? {
    clicks: 0,
    saves: 0,
    ignores: 0,
    reversals: 0,
    repeatSelections: 0,
  };

  if (opts.type === "click") r.clicks = Math.min(MAX_PER_RETAILER, r.clicks + 1);
  else if (opts.type === "save") r.saves = Math.min(MAX_PER_RETAILER, r.saves + 1);
  else if (opts.type === "ignore") r.ignores = Math.min(MAX_PER_RETAILER, r.ignores + 1);
  else if (opts.type === "reversal") r.reversals = Math.min(MAX_PER_RETAILER, r.reversals + 1);
  else if (opts.type === "repeat_select") {
    r.repeatSelections = Math.min(MAX_PER_RETAILER, r.repeatSelections + 1);
  }

  store.retailers[opts.retailer] = r;

  if (opts.canonicalId) {
    const c = store.canonicals[opts.canonicalId] ?? { clicks: 0, saves: 0, ignores: 0 };
    if (opts.type === "click") c.clicks++;
    else if (opts.type === "save") c.saves++;
    else if (opts.type === "ignore") c.ignores++;
    store.canonicals[opts.canonicalId] = c;
  }

  save(store);
  return store;
}

/** Weak ranking nudge only — never mutates confidence or graph evidence. */
export function serverBehavioralRankingBoost(
  retailer: RetailerId,
): { boost: number } {
  const r = loadServerBehavioralStore().retailers[retailer];
  if (!r) return { boost: 0 };

  let boost = 0;
  if (r.repeatSelections >= 3) boost += 0.01;
  if (r.saves >= 2) boost += 0.015;
  if (r.ignores >= 8) boost -= 0.015;

  return { boost: Math.max(-0.02, Math.min(0.03, boost)) };
}
