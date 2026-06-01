/**
 * Composite category trust score — foundational metric for ranking, onboarding, QA, expansion.
 */

import {
  getCategoryCoverageProfile,
  type CategoryCoverageProfile,
  type CoverageMaturityTier,
} from "./category-coverage";

export interface CategoryTrustScore {
  categoryId: string;
  /** 0–100 composite trust score */
  score: number;
  tier: CoverageMaturityTier;
  /** Should receive aggressive promotion in UI/onboarding */
  promote: boolean;
  /** Should explain limitations and avoid overpromising */
  calibrate: boolean;
  factors: {
    verificationReliability: number;
    scrapeSuccessRate: number;
    consumerTrustScore: number;
    inventoryDepth: number;
    retailerOverlap: number;
  };
}

const TIER_WEIGHT: Record<CoverageMaturityTier, number> = {
  production: 1,
  indexed: 0.65,
  experimental: 0.25,
  catalog_only: 0.1,
};

function inventoryDepthScore(profile: CategoryCoverageProfile): number {
  if (profile.activeVerifiedQuotes >= 5) return 1;
  if (profile.activeVerifiedQuotes >= 2) return 0.7;
  if (profile.activeVerifiedQuotes >= 1) return 0.45;
  return 0.1;
}

export function computeCategoryTrustScore(
  categoryId: string,
): CategoryTrustScore {
  const profile = getCategoryCoverageProfile(categoryId);
  const tierW = TIER_WEIGHT[profile.tier];

  const factors = {
    verificationReliability: profile.verificationReliability,
    scrapeSuccessRate: profile.scrapeSuccessRate,
    consumerTrustScore: profile.consumerTrustScore,
    inventoryDepth: inventoryDepthScore(profile),
    retailerOverlap: Math.min(1, profile.retailerOverlap / 3),
  };

  const raw =
    factors.verificationReliability * 0.3 +
    factors.scrapeSuccessRate * 0.15 +
    factors.consumerTrustScore * 0.25 +
    factors.inventoryDepth * 0.2 +
    factors.retailerOverlap * 0.1;

  const score = Math.round(raw * tierW * 100);

  return {
    categoryId,
    score,
    tier: profile.tier,
    promote: score >= 55 && profile.tier === "production",
    calibrate: score < 40 || profile.tier === "experimental",
    factors,
  };
}

/** Ranking multiplier derived from trust score (0.7–1.3). */
export function categoryTrustRankingMultiplier(categoryId: string): number {
  const { score, calibrate } = computeCategoryTrustScore(categoryId);
  if (calibrate) return 0.75 + score / 400;
  return 0.95 + score / 200;
}

/** Categories sorted by trust score — for onboarding prioritization. */
export function getCategoriesByTrustScore(): CategoryTrustScore[] {
  const ids = [
    "pantry",
    "dairy",
    "salad",
    "household",
    "bakery",
    "produce",
    "meat",
    "clothing",
    "shoes",
    "bedding",
    "sports",
  ];
  return ids
    .map(computeCategoryTrustScore)
    .sort((a, b) => b.score - a.score);
}

export function shouldShowRichVerifiedCompare(categoryId?: string): boolean {
  if (!categoryId) return false;
  const trust = computeCategoryTrustScore(categoryId);
  return trust.promote || trust.score >= 50;
}
