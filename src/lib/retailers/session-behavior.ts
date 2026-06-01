import type { RetailerId } from "../types";

/**
 * Humanized session behavior profiles for the rendered (Playwright) executor.
 * These control realism levers we can tune WITHOUT paying for residential
 * proxies: warm vs cold sessions, cookie reuse, navigation pacing, scroll,
 * idle timing, delayed extraction, and multi-step navigation flows. Track which
 * profile materially reduces challenge frequency via strategy analytics.
 */
export type SessionBehaviorId = "cold" | "warm" | "humanized" | "stealth_max";

export interface SessionBehavior {
  id: SessionBehaviorId;
  /** Load a previously saved storageState (cookies/localStorage) if present. */
  reuseSession: boolean;
  /** Persist storageState after a successful navigation. */
  persistSession: boolean;
  /** Randomized delay before navigating (ms range). */
  minPreNavDelayMs: number;
  maxPreNavDelayMs: number;
  /** Scroll the page to trigger lazy content / look human. */
  scroll: boolean;
  scrollSteps: number;
  /** Idle wait after load before reading DOM (ms). */
  idleAfterLoadMs: number;
  /** Extra delay before extraction to let JS challenges resolve (ms). */
  delayedExtractionMs: number;
  /** Visit the retailer homepage first to warm cookies before the target URL. */
  multiStepWarmup: boolean;
}

const PROFILES: Record<SessionBehaviorId, SessionBehavior> = {
  cold: {
    id: "cold",
    reuseSession: false,
    persistSession: false,
    minPreNavDelayMs: 0,
    maxPreNavDelayMs: 0,
    scroll: false,
    scrollSteps: 0,
    idleAfterLoadMs: 0,
    delayedExtractionMs: 0,
    multiStepWarmup: false,
  },
  warm: {
    id: "warm",
    reuseSession: true,
    persistSession: true,
    minPreNavDelayMs: 300,
    maxPreNavDelayMs: 1200,
    scroll: false,
    scrollSteps: 0,
    idleAfterLoadMs: 600,
    delayedExtractionMs: 400,
    multiStepWarmup: false,
  },
  humanized: {
    id: "humanized",
    reuseSession: true,
    persistSession: true,
    minPreNavDelayMs: 600,
    maxPreNavDelayMs: 2500,
    scroll: true,
    scrollSteps: 4,
    idleAfterLoadMs: 1200,
    delayedExtractionMs: 1500,
    multiStepWarmup: true,
  },
  stealth_max: {
    id: "stealth_max",
    reuseSession: true,
    persistSession: true,
    minPreNavDelayMs: 1200,
    maxPreNavDelayMs: 4000,
    scroll: true,
    scrollSteps: 6,
    idleAfterLoadMs: 2500,
    delayedExtractionMs: 3000,
    multiStepWarmup: true,
  },
};

/** Default behavior per retailer, escalating with anti-bot difficulty. */
const RETAILER_DEFAULT: Partial<Record<RetailerId, SessionBehaviorId>> = {
  amazon: "cold", // golden path — keep cheap
  walmart: "humanized",
  target: "humanized",
  kroger: "stealth_max",
  costco: "stealth_max",
  instacart: "humanized",
};

export function getSessionBehavior(id: SessionBehaviorId): SessionBehavior {
  return PROFILES[id];
}

export function listSessionBehaviors(): SessionBehavior[] {
  return Object.values(PROFILES);
}

export function defaultBehaviorForRetailer(retailerId: RetailerId): SessionBehavior {
  const envKey = `INDEX_BEHAVIOR_${retailerId.toUpperCase()}`;
  const override = process.env[envKey]?.trim().toLowerCase();
  if (override && override in PROFILES) {
    return PROFILES[override as SessionBehaviorId];
  }
  return PROFILES[RETAILER_DEFAULT[retailerId] ?? "warm"];
}

/** Next behavior to try when the current one was challenged (escalation). */
export function escalateBehavior(current: SessionBehaviorId): SessionBehaviorId {
  const order: SessionBehaviorId[] = ["cold", "warm", "humanized", "stealth_max"];
  const idx = order.indexOf(current);
  return order[Math.min(idx + 1, order.length - 1)];
}

export function randomDelay(behavior: SessionBehavior): number {
  const { minPreNavDelayMs: lo, maxPreNavDelayMs: hi } = behavior;
  if (hi <= lo) return lo;
  return Math.round(lo + Math.random() * (hi - lo));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}
