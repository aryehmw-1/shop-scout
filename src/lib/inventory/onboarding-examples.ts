/**
 * Dynamic onboarding examples — adapt to current category maturity.
 */

import {
  inferQueryCategoryFamily,
  type QueryCategoryFamily,
} from "./category-coverage";

export const GROCERY_ONBOARDING_EXAMPLES = [
  "Honey nut cereal",
  "Whole milk",
  "Greek yogurt",
  "Ground coffee",
  "Paper towels",
  "Spaghetti",
] as const;

export const APPAREL_ONBOARDING_EXAMPLES = [
  "Paste an Amazon product link",
  "Mens joggers (experimental)",
  "Black hoodie (experimental)",
] as const;

export const GENERAL_ONBOARDING_EXAMPLES = [
  "Browse inventory",
  "Whole milk",
  "Paste an Amazon link",
] as const;

export interface OnboardingContext {
  family: QueryCategoryFamily;
  headline: string;
  subhead: string;
  chips: string[];
  primaryPath: "verified" | "link" | "search";
}

export function getOnboardingContext(query?: string): OnboardingContext {
  const family = inferQueryCategoryFamily(query);

  if (family === "apparel") {
    return {
      family,
      headline: "Apparel — experimental coverage",
      subhead:
        "Live retailer blocking limits apparel compare pricing. Paste a direct product URL for the most reliable compare.",
      chips: [
        "Paste an Amazon product link",
        "Whole milk",
        "Honey nut cereal",
      ],
      primaryPath: "link",
    };
  }

  if (family === "grocery") {
    return {
      family,
      headline: "Grocery compare pricing",
      subhead:
        "Persisted pricing indexed nightly with pack normalization and manual QA review.",
      chips: [...GROCERY_ONBOARDING_EXAMPLES.slice(0, 4), "Browse inventory"],
      primaryPath: "verified",
    };
  }

  return {
    family: "general",
    headline: "Start with inventory",
    subhead:
      "Grocery and household have the strongest persisted pricing. Apparel is experimental — paste a link for those.",
    chips: [...GENERAL_ONBOARDING_EXAMPLES],
    primaryPath: "verified",
  };
}

/** Chat chips after a turn — maturity-aware. */
export function getDynamicOnboardingChips(query?: string, limit = 4): string[] {
  const ctx = getOnboardingContext(query);
  return ctx.chips.slice(0, limit);
}

/** Default welcome chips when no query context. */
export function getWelcomeChips(hasZip: boolean): string[] {
  if (!hasZip) return [];
  return [
    ...GROCERY_ONBOARDING_EXAMPLES.slice(0, 3),
    "Paste an Amazon link",
  ];
}

export const VERIFIED_RECOVERY_SUGGESTIONS = [
  { label: "Honey nut cereal", query: "honey nut cereal" },
  { label: "Whole milk", query: "whole milk" },
  { label: "Ground coffee", query: "ground coffee" },
  { label: "Paper towels", query: "paper towels" },
  { label: "Greek yogurt", query: "greek yogurt" },
  { label: "Spaghetti", query: "spaghetti" },
] as const;
