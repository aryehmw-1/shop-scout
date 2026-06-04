import type { LearningProfile, RetailerId, ShoppingIntent } from "@/lib/types";

export type PurchasePriority = "value" | "trust" | "balanced";

export interface IntelligencePreferences {
  purchasePriority: PurchasePriority;
  preferredRetailers: RetailerId[];
  budgetMax?: number;
  budgetSensitive: boolean;
  retailerBoostCap: number;
  notes: string[];
}

const MAX_RETAILER_BOOST = 0.06;

function topRetailers(profile: LearningProfile | undefined, n = 3): RetailerId[] {
  if (!profile) return [];
  return (
    Object.entries(profile.retailerAffinity) as [RetailerId, number][]
  )
    .filter(([, score]) => score >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

/** Infer shopping style from learning — does not alter confidence scores. */
export function resolveIntelligencePreferences(
  intent?: Partial<ShoppingIntent>,
  profile?: LearningProfile,
): IntelligencePreferences {
  const notes: string[] = [];
  const preferredRetailers = topRetailers(profile ?? intent?.learningProfile);
  const budgetMax = intent?.maxPrice;
  const budgetSensitive = budgetMax != null && budgetMax > 0;

  let purchasePriority: PurchasePriority = "balanced";
  if (intent?.maxPrice != null && intent.maxPrice < 30) {
    purchasePriority = "value";
    notes.push("Budget-sensitive query detected");
  }
  if (preferredRetailers.length >= 2) {
    const topScore = profile?.retailerAffinity[preferredRetailers[0]!] ?? 0;
    if (topScore >= 9) {
      purchasePriority = "trust";
      notes.push(`Frequent ${preferredRetailers[0]} shopper`);
    }
  }

  return {
    purchasePriority,
    preferredRetailers,
    budgetMax,
    budgetSensitive,
    retailerBoostCap: MAX_RETAILER_BOOST,
    notes,
  };
}

export function preferenceRankingBoost(
  prefs: IntelligencePreferences,
  retailer: RetailerId,
  offerConfidence: number,
): number {
  let boost = 0;
  const idx = prefs.preferredRetailers.indexOf(retailer);
  if (idx === 0) boost += prefs.retailerBoostCap;
  else if (idx === 1) boost += prefs.retailerBoostCap * 0.6;
  else if (idx === 2) boost += prefs.retailerBoostCap * 0.3;

  if (prefs.purchasePriority === "trust" && offerConfidence >= 0.65) {
    boost += 0.02;
  }
  return Math.min(prefs.retailerBoostCap + 0.02, boost);
}

export function personalizationSummary(prefs: IntelligencePreferences): string | null {
  const parts: string[] = [];
  if (prefs.preferredRetailers.length) {
    parts.push(`You often shop at ${prefs.preferredRetailers.slice(0, 2).join(" and ")}`);
  }
  if (prefs.purchasePriority === "value") {
    parts.push("prioritizing lowest verified price");
  } else if (prefs.purchasePriority === "trust") {
    parts.push("prioritizing highest-confidence offers");
  }
  if (prefs.budgetMax) {
    parts.push(`around $${prefs.budgetMax} budget`);
  }
  if (!parts.length) return null;
  return `${parts.join(" · ")} — ranking adjusted, evidence unchanged.`;
}
