import type { RetailerId } from "../../types";
import type { FetchMethod } from "../fetch-strategy";
import type { SessionBehaviorId } from "../session-behavior";
import type { ProxyTransport } from "../../net/proxy-routing";

/**
 * Strategy effectiveness analytics: which combination of (retailer × fetch
 * method × session behavior × transport) actually works. This is how we learn
 * whether rendered execution + humanized sessions materially reduce challenge
 * frequency vs cheaper paths.
 */
export interface StrategyKey {
  retailerId: RetailerId;
  method: FetchMethod;
  behavior?: SessionBehaviorId;
  proxyUsed: boolean;
  transport?: ProxyTransport;
}

interface StrategyStats {
  retailerId: RetailerId;
  method: FetchMethod;
  behavior?: SessionBehaviorId;
  proxyUsed: boolean;
  transport?: ProxyTransport;
  attempts: number;
  successes: number;
  blocks: number;
  captchas: number;
  cacheHits: number;
  totalLatencyMs: number;
  totalBytes: number;
  lastCategory?: string;
  updatedAt: string;
}

export interface StrategyOutcome {
  ok: boolean;
  blocked: boolean;
  /** Classification category, e.g. "captcha", "js_challenge". */
  category?: string;
  latencyMs: number;
  bytes: number;
  cached?: boolean;
}

const memory = new Map<string, StrategyStats>();

function keyOf(k: StrategyKey): string {
  return `${k.retailerId}|${k.method}|${k.behavior ?? "-"}|${k.transport ?? (k.proxyUsed ? "proxy" : "direct")}`;
}

export function recordStrategyOutcome(key: StrategyKey, outcome: StrategyOutcome): void {
  const id = keyOf(key);
  const row =
    memory.get(id) ??
    ({
      retailerId: key.retailerId,
      method: key.method,
      behavior: key.behavior,
      proxyUsed: key.proxyUsed,
      transport: key.transport,
      attempts: 0,
      successes: 0,
      blocks: 0,
      captchas: 0,
      cacheHits: 0,
      totalLatencyMs: 0,
      totalBytes: 0,
      updatedAt: new Date().toISOString(),
    } satisfies StrategyStats);

  row.attempts += 1;
  if (outcome.ok) row.successes += 1;
  if (outcome.blocked) row.blocks += 1;
  if (outcome.category === "captcha") row.captchas += 1;
  if (outcome.cached) row.cacheHits += 1;
  row.totalLatencyMs += outcome.latencyMs;
  row.totalBytes += outcome.bytes;
  row.lastCategory = outcome.category ?? row.lastCategory;
  row.updatedAt = new Date().toISOString();
  memory.set(id, row);
}

export interface StrategyEffectivenessRow {
  retailerId: RetailerId;
  method: FetchMethod;
  behavior?: SessionBehaviorId;
  transport: ProxyTransport | "proxy" | "direct";
  attempts: number;
  successRate: number;
  blockRate: number;
  captchaRate: number;
  cacheHitRate: number;
  avgLatencyMs: number;
  avgKb: number;
  lastCategory?: string;
}

export function strategyEffectiveness(): StrategyEffectivenessRow[] {
  return [...memory.values()]
    .map((r) => ({
      retailerId: r.retailerId,
      method: r.method,
      behavior: r.behavior,
      transport: (r.transport ?? (r.proxyUsed ? "proxy" : "direct")) as
        | ProxyTransport
        | "proxy"
        | "direct",
      attempts: r.attempts,
      successRate: pct(r.successes, r.attempts),
      blockRate: pct(r.blocks, r.attempts),
      captchaRate: pct(r.captchas, r.attempts),
      cacheHitRate: pct(r.cacheHits, r.attempts),
      avgLatencyMs: r.attempts ? Math.round(r.totalLatencyMs / r.attempts) : 0,
      avgKb: r.attempts ? Math.round((r.totalBytes / r.attempts / 1024) * 100) / 100 : 0,
      lastCategory: r.lastCategory,
    }))
    .sort((a, b) => b.attempts - a.attempts);
}

/** Recent block rate for a retailer+method (used by challenge-probability). */
export function recentBlockRate(retailerId: RetailerId, method?: FetchMethod): number {
  const rows = [...memory.values()].filter(
    (r) => r.retailerId === retailerId && (!method || r.method === method),
  );
  const attempts = rows.reduce((s, r) => s + r.attempts, 0);
  const blocks = rows.reduce((s, r) => s + r.blocks, 0);
  return attempts ? blocks / attempts : 0;
}

function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

const TRANSPORT_COST: Record<string, number> = {
  direct: 0,
  datacenter: 1,
  proxy: 1,
  residential: 2,
};

export interface TransportRecommendation {
  retailerId: RetailerId;
  /** Cheapest transport that achieved acceptable success, if any. */
  recommended?: ProxyTransport | "proxy" | "direct";
  successRate?: number;
  avgLatencyMs?: number;
  challengeFrequency?: number;
  rationale: string;
  options: Array<{
    transport: ProxyTransport | "proxy" | "direct";
    attempts: number;
    successRate: number;
    blockRate: number;
    avgLatencyMs: number;
    cost: number;
  }>;
}

/**
 * Synthesize the minimum-cost transport that achieves stable extraction per
 * retailer: aggregate by transport, require a success-rate threshold, then pick
 * the cheapest passing transport (ties broken by success rate, then latency).
 */
export function recommendTransports(minSuccessRate = 60): TransportRecommendation[] {
  const byRetailer = new Map<RetailerId, Map<string, StrategyStats[]>>();
  for (const r of memory.values()) {
    const t = r.transport ?? (r.proxyUsed ? "proxy" : "direct");
    if (!byRetailer.has(r.retailerId)) byRetailer.set(r.retailerId, new Map());
    const tmap = byRetailer.get(r.retailerId)!;
    if (!tmap.has(t)) tmap.set(t, []);
    tmap.get(t)!.push(r);
  }

  const out: TransportRecommendation[] = [];
  for (const [retailerId, tmap] of byRetailer.entries()) {
    const options = [...tmap.entries()].map(([transport, rows]) => {
      const attempts = rows.reduce((s, r) => s + r.attempts, 0);
      const successes = rows.reduce((s, r) => s + r.successes, 0);
      const blocks = rows.reduce((s, r) => s + r.blocks, 0);
      const latency = rows.reduce((s, r) => s + r.totalLatencyMs, 0);
      return {
        transport: transport as ProxyTransport | "proxy" | "direct",
        attempts,
        successRate: pct(successes, attempts),
        blockRate: pct(blocks, attempts),
        avgLatencyMs: attempts ? Math.round(latency / attempts) : 0,
        cost: TRANSPORT_COST[transport] ?? 1,
      };
    });

    const passing = options
      .filter((o) => o.attempts > 0 && o.successRate >= minSuccessRate)
      .sort((a, b) => a.cost - b.cost || b.successRate - a.successRate || a.avgLatencyMs - b.avgLatencyMs);

    const best = passing[0];
    out.push({
      retailerId,
      recommended: best?.transport,
      successRate: best?.successRate,
      avgLatencyMs: best?.avgLatencyMs,
      challengeFrequency: best?.blockRate,
      rationale: best
        ? `cheapest transport (cost=${best.cost}) with success ${best.successRate}% over ${best.attempts} attempts`
        : `no transport reached ${minSuccessRate}% success yet — needs stronger transport or more samples`,
      options: options.sort((a, b) => a.cost - b.cost),
    });
  }
  return out;
}
