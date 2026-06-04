import type { RetailerId } from "@/lib/types";
import { loadSnapshots } from "../drift/snapshots";
import { upsertMemoryEntry } from "../memory/store";
import { loadAllGraphs } from "../graph/store";

export interface WinnerSurvivalStats {
  canonicalId: string;
  title: string;
  currentWinner: string;
  winnerSurvivalSnapshots: number;
  totalSnapshots: number;
  survivalRate: number;
  avgCompositeScore: number;
  confidenceOutcomeProxy: number;
}

export interface RetailerPerformanceProfile {
  retailer: RetailerId;
  timesWon: number;
  timesOffered: number;
  winRate: number;
  avgWinningPrice: number;
  avgCompositeWhenWon: number;
  disagreementRate: number;
}

export function buildCanonicalSurvivalProfiles(): WinnerSurvivalStats[] {
  const graphs = loadAllGraphs();
  const out: WinnerSurvivalStats[] = [];

  for (const g of graphs) {
    const snaps = loadSnapshots(g.canonical.canonical_id);
    if (!snaps.length) continue;

    const current = snaps[0]!;
    const sameWinner = snaps.filter((s) => s.winnerOfferId === current.winnerOfferId).length;
    const avgScore =
      snaps.reduce((a, s) => a + s.compositeScore, 0) / snaps.length;

    out.push({
      canonicalId: g.canonical.canonical_id,
      title: g.canonical.title,
      currentWinner: current.winnerRetailer,
      winnerSurvivalSnapshots: sameWinner,
      totalSnapshots: snaps.length,
      survivalRate: snaps.length ? sameWinner / snaps.length : 0,
      avgCompositeScore: Math.round(avgScore * 1000) / 1000,
      confidenceOutcomeProxy: g.identity_confidence.overall,
    });
  }

  return out.sort((a, b) => b.survivalRate - a.survivalRate);
}

export function buildRetailerPerformanceProfiles(): RetailerPerformanceProfile[] {
  const graphs = loadAllGraphs();
  const stats = new Map<
    RetailerId,
    { won: number; offered: number; prices: number[]; composites: number[]; disagreements: number }
  >();

  for (const g of graphs) {
    const validated = g.offers.filter((o) => o.validation_status === "validated");
    const snaps = loadSnapshots(g.canonical.canonical_id);
    const winnerId = snaps[0]?.winnerOfferId;

    for (const o of validated) {
      const cur = stats.get(o.retailer) ?? {
        won: 0,
        offered: 0,
        prices: [],
        composites: [],
        disagreements: 0,
      };
      cur.offered++;
      cur.prices.push(o.price);
      if (o.confidence?.overall != null) cur.composites.push(o.confidence.overall);
      if (o.offer_id === winnerId) cur.won++;
      if ((o.confidence?.overall ?? 0) < 0.52) cur.disagreements++;
      stats.set(o.retailer, cur);
    }
  }

  return [...stats.entries()].map(([retailer, s]) => ({
    retailer,
    timesWon: s.won,
    timesOffered: s.offered,
    winRate: s.offered ? s.won / s.offered : 0,
    avgWinningPrice:
      s.prices.length ?
        Math.round((s.prices.reduce((a, b) => a + b, 0) / s.prices.length) * 100) / 100
      : 0,
    avgCompositeWhenWon:
      s.composites.length ?
        Math.round((s.composites.reduce((a, b) => a + b, 0) / s.composites.length) * 1000) / 1000
      : 0,
    disagreementRate: s.offered ? s.disagreements / s.offered : 0,
  }));
}

export function recordLongitudinalMemoryFromSnapshots(): void {
  for (const p of buildCanonicalSurvivalProfiles()) {
    upsertMemoryEntry("recommendation_history", `survival:${p.canonicalId}`, p, {
      source: "longitudinal",
    });
  }
  for (const r of buildRetailerPerformanceProfiles()) {
    upsertMemoryEntry("factual", `retailer_perf:${r.retailer}`, r, { source: "longitudinal" });
  }
}
