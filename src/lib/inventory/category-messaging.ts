/**
 * Dynamic category confidence messaging for search/chat UX.
 */

import {
  getFamilyCoverageProfile,
  inferQueryCategoryFamily,
  type CategoryCoverageProfile,
  type QueryCategoryFamily,
} from "./category-coverage";

export interface CategoryConfidenceMessage {
  family: QueryCategoryFamily;
  tier: CategoryCoverageProfile["tier"];
  badge: string;
  headline: string;
  detail: string;
  tips: string[];
  showExperimentalBanner: boolean;
  emphasizeVerifiedInventory: boolean;
}

export function getCategoryConfidenceMessage(
  query?: string,
): CategoryConfidenceMessage {
  const family = inferQueryCategoryFamily(query);
  const profile = getFamilyCoverageProfile(family);

  if (family === "apparel") {
    return {
      family,
      tier: profile.tier,
      badge: "Experimental coverage",
      headline: "Apparel search is experimental",
      detail:
        "Homivion works best for groceries and household items. For clothing and shoes, paste a direct product link for the most reliable compare.",
      tips: [
        "Paste a direct Amazon or retailer product URL for the most reliable compare",
        "Try refining with brand, size, and color — conversational follow-ups work",
        "Search groceries and household staples for the strongest coverage",
      ],
      showExperimentalBanner: true,
      emphasizeVerifiedInventory: false,
    };
  }

  if (family === "grocery") {
    return {
      family,
      tier: profile.tier,
      badge: "Verified pricing",
      headline: "Strong price coverage for groceries",
      detail:
        "We compare live prices on everyday essentials like milk, cereal, coffee, and paper towels — with pack sizes shown clearly on each offer.",
      tips: [
        "Try a specific product name for the best match",
        "Paste an Amazon link to compare that exact item",
        "Check pack size on each card before you buy",
      ],
      showExperimentalBanner: false,
      emphasizeVerifiedInventory: true,
    };
  }

  if (family === "home") {
    return {
      family,
      tier: "catalog_only",
      badge: "Limited verification",
      headline: "Home category — catalog estimates",
      detail:
        "Live verified pricing is still limited for home and bedding. Paste a product link, or try groceries and household items where coverage is strongest.",
      tips: [
        "Paste a product link for best accuracy",
        "Try verified categories: pantry, dairy, household",
      ],
      showExperimentalBanner: true,
      emphasizeVerifiedInventory: false,
    };
  }

  return {
    family: "general",
    tier: profile.tier,
    badge: profile.badge,
    headline: "Search our curated catalog",
    detail:
      "We verify grocery and household products most reliably. Other categories may show estimates until live checks succeed.",
    tips: [
      "Try cereal, milk, coffee, or paper towels for verified results",
      "Paste a product URL when you have one",
    ],
    showExperimentalBanner: false,
    emphasizeVerifiedInventory: false,
  };
}
