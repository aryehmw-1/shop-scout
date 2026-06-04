import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type IntelligenceAnalyticsEvent =
  | "recommendation_shown"
  | "trust_details_open"
  | "analyst_mode_open"
  | "trust_details_close"
  | "offer_click"
  | "offer_save"
  | "recommendation_ignore"
  | "recommendation_no_match"
  | "session_abandon"
  | "query_category"
  | "session_return"
  | "onboarding_completed"
  | "onboarding_dismissed_early"
  | "onboarding_reopened";

export interface AnalyticsEventRecord {
  at: string;
  event: IntelligenceAnalyticsEvent;
  sessionId?: string;
  canonicalId?: string;
  retailer?: string;
  queryCategory?: string;
  meta?: Record<string, string | number | boolean>;
}

export interface AnalyticsStoreFile {
  version: 1;
  updatedAt: string;
  events: AnalyticsEventRecord[];
}

const PATH = join(process.cwd(), "data", "intelligence-graph", "analytics-events.json");
const MAX_EVENTS = 5000;

function empty(): AnalyticsStoreFile {
  return { version: 1, updatedAt: new Date().toISOString(), events: [] };
}

export function loadAnalyticsEvents(): AnalyticsStoreFile {
  if (!existsSync(PATH)) return empty();
  try {
    return JSON.parse(readFileSync(PATH, "utf8")) as AnalyticsStoreFile;
  } catch {
    return empty();
  }
}

export function recordAnalyticsEvent(
  event: Omit<AnalyticsEventRecord, "at">,
): void {
  const store = loadAnalyticsEvents();
  store.events.unshift({ ...event, at: new Date().toISOString() });
  store.events = store.events.slice(0, MAX_EVENTS);
  store.updatedAt = new Date().toISOString();
  mkdirSync(join(process.cwd(), "data", "intelligence-graph"), { recursive: true });
  writeFileSync(PATH, JSON.stringify(store, null, 2));
}

export function analyticsSummary(): {
  last24h: Record<string, number>;
  totals: Record<string, number>;
} {
  const store = loadAnalyticsEvents();
  const cutoff = Date.now() - 86400000;
  const last24h: Record<string, number> = {};
  const totals: Record<string, number> = {};

  for (const e of store.events) {
    totals[e.event] = (totals[e.event] ?? 0) + 1;
    if (new Date(e.at).getTime() >= cutoff) {
      last24h[e.event] = (last24h[e.event] ?? 0) + 1;
    }
  }

  return { last24h, totals };
}
