import type { ProductOffer } from "@/lib/types";
import { trustMemoryRankingBoost } from "../trust-memory/store";
import { serverBehavioralRankingBoost } from "../feedback/server-store";
import type { IntelligencePreferences } from "./preferences";
import { preferenceRankingBoost } from "./preferences";

/**
 * Re-order offers for display using lightweight preferences.
 * Does NOT change matchConfidence or validation — display-only ranking.
 */
export function rankOffersWithPreferences(
  offers: ProductOffer[],
  prefs: IntelligencePreferences,
): ProductOffer[] {
  if (!offers.length) return offers;

  const scored = offers.map((offer, index) => {
    const conf = offer.matchConfidence ?? 0;
    let rankScore = -offer.price;

    if (prefs.purchasePriority === "trust") {
      rankScore = conf * 1000 - offer.price * 0.01;
    } else if (prefs.purchasePriority === "value") {
      rankScore = -offer.price * 1000 + conf;
    } else {
      rankScore = -offer.price * 500 + conf * 100;
    }

    rankScore += preferenceRankingBoost(prefs, offer.retailer, conf) * 10000;

    const trustBoost = trustMemoryRankingBoost(offer.retailer, offer.catalogId);
    rankScore += trustBoost.boost * 10000;

    if (typeof window === "undefined") {
      rankScore += serverBehavioralRankingBoost(offer.retailer).boost * 10000;
    }

    if (prefs.budgetMax != null && offer.price > prefs.budgetMax) {
      rankScore -= 50000;
    }

    return { offer, rankScore, index };
  });

  scored.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    return a.index - b.index;
  });

  return scored.map((s) => s.offer);
}
