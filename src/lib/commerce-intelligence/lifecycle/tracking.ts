import { loadAllGraphs } from "../graph/store";
import { loadSnapshots } from "../drift/snapshots";
import { upsertMemoryEntry } from "../memory/store";
import { buildRetailerIntelligenceProfiles } from "../reputation/retailer-intelligence";

export interface RecommendationLifecycleEntry {
  canonicalId: string;
  title: string;
  currentWinnerRetailer: string;
  recommendationAgeHours: number;
  winnerReplacementCount: number;
  estimatedHalfLifeHours: number;
  regime: "stable" | "shifting" | "volatile";
}

export interface LifecycleReport {
  evaluatedAt: string;
  entries: RecommendationLifecycleEntry[];
  retailerReliabilityDelta: Array<{
    retailer: string;
    trustScore: number;
    staleOfferRate: number;
  }>;
  marketRegimeNote: string;
}

export function buildLifecycleReport(): LifecycleReport {
  const graphs = loadAllGraphs();
  const entries: RecommendationLifecycleEntry[] = [];
  let volatileCount = 0;

  for (const g of graphs) {
    const snaps = loadSnapshots(g.canonical.canonical_id);
    if (!snaps.length) continue;

    const current = snaps[0]!;
    const ageMs = Date.now() - new Date(current.at).getTime();
    const recommendationAgeHours = Math.round(ageMs / 3600000);

    let replacements = 0;
    for (let i = 1; i < snaps.length; i++) {
      if (snaps[i]!.winnerOfferId !== snaps[i - 1]!.winnerOfferId) replacements++;
    }

    const replacementRate = snaps.length > 1 ? replacements / (snaps.length - 1) : 0;
    const regime: RecommendationLifecycleEntry["regime"] =
      replacementRate >= 0.5 ? "volatile"
      : replacementRate >= 0.25 ? "shifting"
      : "stable";
    if (regime === "volatile") volatileCount++;

    const halfLife = Math.max(6, 48 * (1 - replacementRate));

    entries.push({
      canonicalId: g.canonical.canonical_id,
      title: g.canonical.title,
      currentWinnerRetailer: current.winnerRetailer,
      recommendationAgeHours,
      winnerReplacementCount: replacements,
      estimatedHalfLifeHours: Math.round(halfLife),
      regime,
    });

    upsertMemoryEntry("evaluation", `lifecycle:${g.canonical.canonical_id}`, entries[entries.length - 1], {
      source: "lifecycle",
    });
  }

  const retailers = buildRetailerIntelligenceProfiles();
  for (const r of retailers) {
    upsertMemoryEntry("trust", `retailer_trust:${r.retailer}`, r, { source: "lifecycle" });
  }

  const marketRegimeNote =
    volatileCount === 0 ?
      "Catalog recommendations are stable across recent snapshots."
    : `${volatileCount} product(s) show volatile winner churn — expect shorter recommendation half-lives.`;

  return {
    evaluatedAt: new Date().toISOString(),
    entries: entries.sort((a, b) => b.winnerReplacementCount - a.winnerReplacementCount),
    retailerReliabilityDelta: retailers.map((r) => ({
      retailer: r.retailer,
      trustScore: r.trustScore,
      staleOfferRate: r.staleOfferRate,
    })),
    marketRegimeNote,
  };
}
