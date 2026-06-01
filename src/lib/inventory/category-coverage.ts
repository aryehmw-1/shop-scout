/**
 * Category coverage maturity — honest UX about what Shop Scout verifies well today.
 */

import { DEPRIORITIZED_INDEX_CATEGORIES } from "./flagship-catalog";
import { categoryTrustRankingMultiplier } from "./category-trust-score";

export type CoverageMaturityTier =
  | "production"
  | "indexed"
  | "experimental"
  | "catalog_only";

export type QueryCategoryFamily =
  | "grocery"
  | "apparel"
  | "home"
  | "general";

export interface CategoryCoverageProfile {
  categoryId: string;
  label: string;
  family: QueryCategoryFamily;
  tier: CoverageMaturityTier;
  /** Active verified quote rows in DB (updated at build/runtime). */
  activeVerifiedQuotes: number;
  activeProducts: number;
  retailerOverlap: number;
  /** 0–1 composite verification reliability for UI/ranking hints. */
  verificationReliability: number;
  scrapeSuccessRate: number;
  consumerTrustScore: number;
  demoQueries: string[];
  badge: string;
  shortMessage: string;
  detailMessage: string;
}

/** Baseline from latest flagship index run — refresh via computeCategoryCoverageFromDb(). */
const CATEGORY_BASELINE: Record<string, Partial<CategoryCoverageProfile>> = {
  pantry: {
    tier: "production",
    activeVerifiedQuotes: 6,
    activeProducts: 6,
    retailerOverlap: 0,
    verificationReliability: 0.86,
    scrapeSuccessRate: 0.32,
    consumerTrustScore: 0.82,
  },
  dairy: {
    tier: "production",
    activeVerifiedQuotes: 5,
    activeProducts: 5,
    verificationReliability: 0.86,
    scrapeSuccessRate: 0.32,
    consumerTrustScore: 0.82,
  },
  salad: {
    tier: "production",
    activeVerifiedQuotes: 4,
    activeProducts: 4,
    verificationReliability: 0.85,
    scrapeSuccessRate: 0.3,
    consumerTrustScore: 0.8,
  },
  bakery: {
    tier: "indexed",
    activeVerifiedQuotes: 1,
    activeProducts: 1,
    verificationReliability: 0.8,
    scrapeSuccessRate: 0.28,
    consumerTrustScore: 0.78,
  },
  household: {
    tier: "production",
    activeVerifiedQuotes: 1,
    activeProducts: 1,
    verificationReliability: 0.85,
    scrapeSuccessRate: 0.32,
    consumerTrustScore: 0.8,
  },
  produce: {
    tier: "indexed",
    activeVerifiedQuotes: 1,
    activeProducts: 1,
    verificationReliability: 0.8,
    scrapeSuccessRate: 0.28,
    consumerTrustScore: 0.78,
  },
  meat: {
    tier: "indexed",
    activeVerifiedQuotes: 0,
    activeProducts: 0,
    verificationReliability: 0.45,
    scrapeSuccessRate: 0.15,
    consumerTrustScore: 0.5,
  },
  clothing: {
    tier: "experimental",
    activeVerifiedQuotes: 0,
    activeProducts: 0,
    verificationReliability: 0.2,
    scrapeSuccessRate: 0.05,
    consumerTrustScore: 0.25,
  },
  shoes: {
    tier: "experimental",
    activeVerifiedQuotes: 0,
    activeProducts: 0,
    verificationReliability: 0.2,
    scrapeSuccessRate: 0.05,
    consumerTrustScore: 0.25,
  },
  bedding: {
    tier: "catalog_only",
    activeVerifiedQuotes: 0,
    verificationReliability: 0.15,
    scrapeSuccessRate: 0.05,
    consumerTrustScore: 0.2,
  },
  sports: {
    tier: "experimental",
    activeVerifiedQuotes: 0,
    verificationReliability: 0.2,
    scrapeSuccessRate: 0.08,
    consumerTrustScore: 0.3,
  },
};

const GROCERY_CATEGORIES = new Set([
  "pantry",
  "dairy",
  "salad",
  "bakery",
  "produce",
  "meat",
  "household",
]);

const APPAREL_QUERY =
  /\b(jogger|jeans|denim|chino|hoodie|hoody|sweater|shirt|pants|trousers|dress|sneaker|shoe|boot|apparel|mens|womens|nike|adidas|lululemon)\b/i;

const GROCERY_QUERY =
  /\b(milk|egg|yogurt|butter|cheese|cereal|coffee|pasta|rice|paper towel|spinach|salad|chicken|beef|grocery|pantry|snack|chips|pretzel|cracker|juice|bread|produce|banana)\b/i;

export function inferQueryCategoryFamily(query?: string): QueryCategoryFamily {
  const q = (query ?? "").toLowerCase();
  if (!q.trim()) return "general";
  if (APPAREL_QUERY.test(q)) return "apparel";
  if (GROCERY_QUERY.test(q)) return "grocery";
  if (/\b(mattress|bedding|sheet|comforter|pillow|sofa|couch)\b/i.test(q)) return "home";
  return "general";
}

export function inferCatalogCategoryFamily(categoryId?: string): QueryCategoryFamily {
  if (!categoryId) return "general";
  if (GROCERY_CATEGORIES.has(categoryId)) return "grocery";
  if (categoryId === "clothing" || categoryId === "shoes") return "apparel";
  if (categoryId === "bedding") return "home";
  return "general";
}

function tierDefaults(tier: CoverageMaturityTier): Pick<
  CategoryCoverageProfile,
  "shortMessage" | "detailMessage" | "badge"
> {
  switch (tier) {
    case "production":
      return {
        badge: "Verified nightly",
        shortMessage: "Strong verified inventory with persisted Amazon pricing.",
        detailMessage:
          "These products are indexed nightly with pack normalization and manual QA. Prices are verified before display.",
      };
    case "indexed":
      return {
        badge: "Partially verified",
        shortMessage: "Some verified quotes available; coverage still growing.",
        detailMessage:
          "We have catalog matches and selective verified pricing. Results improve as indexing runs.",
      };
    case "experimental":
      return {
        badge: "Experimental",
        shortMessage: "Limited verified coverage — paste a product URL for best results.",
        detailMessage:
          "Apparel and fashion retailers often block automated price checks without residential proxy. Catalog estimates may appear; verified prices are not yet production-grade.",
      };
    default:
      return {
        badge: "Catalog only",
        shortMessage: "Browse catalog estimates — verified pricing not yet available.",
        detailMessage:
          "We can show reference pricing, but live verification is limited in this category today.",
      };
  }
}

export function getCategoryCoverageProfile(
  categoryId: string,
): CategoryCoverageProfile {
  const base = CATEGORY_BASELINE[categoryId] ?? {
    tier: "catalog_only" as const,
    activeVerifiedQuotes: 0,
    activeProducts: 0,
    retailerOverlap: 0,
    verificationReliability: 0.2,
    scrapeSuccessRate: 0.1,
    consumerTrustScore: 0.25,
  };

  const tier = base.tier ?? "catalog_only";
  const family = inferCatalogCategoryFamily(categoryId);
  const defaults = tierDefaults(tier);

  const demoQueries: Record<string, string[]> = {
    pantry: ["Honey nut cereal", "Ground coffee", "Spaghetti", "Potato chips"],
    dairy: ["Whole milk", "Greek yogurt", "Large eggs", "Salted butter"],
    salad: ["Organic spinach", "Spring mix salad", "Romaine hearts"],
    household: ["Paper towels"],
    bakery: ["Whole wheat bread"],
    produce: ["Orange juice"],
    meat: ["Chicken breast", "Ground beef"],
    clothing: ["Mens joggers", "Black hoodie"],
    shoes: ["Running shoes"],
  };

  const labels: Record<string, string> = {
    pantry: "Pantry & snacks",
    dairy: "Dairy & eggs",
    salad: "Salad & greens",
    household: "Household",
    bakery: "Bakery",
    produce: "Produce",
    meat: "Meat",
    clothing: "Clothing",
    shoes: "Shoes",
    bedding: "Bedding",
    sports: "Sports",
  };

  return {
    categoryId,
    label: labels[categoryId] ?? categoryId,
    family,
    tier,
    activeVerifiedQuotes: base.activeVerifiedQuotes ?? 0,
    activeProducts: base.activeProducts ?? 0,
    retailerOverlap: base.retailerOverlap ?? 0,
    verificationReliability: base.verificationReliability ?? 0.2,
    scrapeSuccessRate: base.scrapeSuccessRate ?? 0.1,
    consumerTrustScore: base.consumerTrustScore ?? 0.25,
    demoQueries: demoQueries[categoryId] ?? [],
    ...defaults,
  };
}

export function getFamilyCoverageProfile(
  family: QueryCategoryFamily,
): CategoryCoverageProfile {
  if (family === "grocery") return getCategoryCoverageProfile("pantry");
  if (family === "apparel") return getCategoryCoverageProfile("clothing");
  if (family === "home") return getCategoryCoverageProfile("bedding");
  return getCategoryCoverageProfile("pantry");
}

export function isExperimentalCategory(categoryId: string): boolean {
  return (
    DEPRIORITIZED_INDEX_CATEGORIES.has(categoryId) ||
    getCategoryCoverageProfile(categoryId).tier === "experimental"
  );
}

export function getVerifiedFirstCategories(): Array<{
  id: string;
  label: string;
  emoji: string;
  query: string;
  tier: CoverageMaturityTier;
  badge: string;
}> {
  return [
    {
      id: "pantry",
      label: "Pantry & snacks",
      emoji: "🥣",
      query: "honey nut cereal",
      tier: "production",
      badge: "Verified",
    },
    {
      id: "dairy",
      label: "Dairy & eggs",
      emoji: "🥛",
      query: "whole milk",
      tier: "production",
      badge: "Verified",
    },
    {
      id: "salad",
      label: "Salad & greens",
      emoji: "🥗",
      query: "organic spinach",
      tier: "production" as const,
      badge: "Verified",
    },
    {
      id: "household",
      label: "Household",
      emoji: "🧻",
      query: "paper towels",
      tier: "production",
      badge: "Verified",
    },
    {
      id: "meat",
      label: "Meat & protein",
      emoji: "🍗",
      query: "chicken breast",
      tier: "indexed",
      badge: "Growing",
    },
    {
      id: "clothing",
      label: "Clothing",
      emoji: "👕",
      query: "mens hoodie",
      tier: "experimental",
      badge: "Beta",
    },
  ];
}

export function getProductionCategoryIds(): string[] {
  return Object.entries(CATEGORY_BASELINE)
    .filter(([, v]) => v.tier === "production" || v.tier === "indexed")
    .map(([k]) => k);
}

/** Ranking hint: boost reliability for production-tier categories. */
export function categoryRankingBoost(categoryId: string): number {
  return (categoryTrustRankingMultiplier(categoryId) - 1) * 0.5;
}
