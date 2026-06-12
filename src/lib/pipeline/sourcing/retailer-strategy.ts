import type { ProductCategoryKind } from "../types";

/**
 * Top-retailers-first sourcing strategy.
 *
 * We deliberately DO NOT try to check every store — that is too expensive and
 * adds validation complexity. Instead we ingest from a focused set of major
 * retailers, prioritized per product category, and keep only the best few
 * verified offers per product.
 *
 * NOTE: this controls INGESTION only. Public search never uses any of this — it
 * reads already-published rows from Postgres (no scraping, AI, or Bright Data).
 */

/** Sourcing retailer keys. Superset of RetailerId — `homedepot` is planned and
 *  should be added to RetailerId once onboarded as a live retailer. */
export type SourcingRetailer =
  | "amazon"
  | "ebay"
  | "walmart"
  | "target"
  | "bestbuy"
  | "homedepot"
  | "costco";

/** Global priority order (lower index = checked first). Costco is optional. */
export const TOP_RETAILERS: readonly SourcingRetailer[] = [
  "amazon",
  "ebay",
  "walmart",
  "target",
  "bestbuy",
  "homedepot",
  "costco",
];

/** Costco is included only when reliable/available — gated by env so it can be
 *  toggled without a deploy-time code change. */
export function isCostcoEnabled(): boolean {
  return process.env.SOURCING_ENABLE_COSTCO === "on";
}

/**
 * Coarse sourcing category. ProductCategoryKind has no "home_improvement", so we
 * derive it from the raw category string when available; otherwise fall back to
 * the normalized kind.
 */
export type SourcingCategory =
  | "grocery_household"
  | "electronics"
  | "home_improvement"
  | "general";

const HOME_IMPROVEMENT_RE =
  /\b(tool|hardware|paint|lumber|plumbing|hvac|garden|patio|flooring|lighting|fixture|drill|saw)\b/i;

/** Map a product to its sourcing category (uses raw category text if given). */
export function sourcingCategory(
  kind: ProductCategoryKind,
  rawCategory?: string,
): SourcingCategory {
  if (rawCategory && HOME_IMPROVEMENT_RE.test(rawCategory)) return "home_improvement";
  switch (kind) {
    case "grocery":
    case "household":
      return "grocery_household";
    case "electronics":
      return "electronics";
    default:
      return "general";
  }
}

/** Category → ordered retailer priority (per the sourcing spec). */
const CATEGORY_PRIORITY: Record<SourcingCategory, readonly SourcingRetailer[]> = {
  grocery_household: ["walmart", "target", "amazon", "costco"],
  electronics: ["amazon", "bestbuy", "walmart", "ebay"],
  home_improvement: ["homedepot", "amazon", "walmart"],
  general: ["amazon", "walmart", "target", "ebay"],
};

/**
 * Ordered list of retailers to source for a product, most-preferred first.
 * Costco is dropped unless explicitly enabled.
 */
export function retailersForCategory(
  category: SourcingCategory,
): SourcingRetailer[] {
  return CATEGORY_PRIORITY[category].filter(
    (r) => r !== "costco" || isCostcoEnabled(),
  );
}

/** We store the best 3–5 verified offers per product, never every offer. */
export const MIN_OFFERS_PER_PRODUCT = 3;
export const MAX_OFFERS_PER_PRODUCT = 5;

/**
 * Popularity-based refresh cadence. Popular products are refreshed far more
 * often than the long tail. `popularityScore` is 0–100 (Product.popularityScore).
 */
export function refreshIntervalHours(popularityScore: number): number {
  if (popularityScore >= 80) return 12; // hot — twice a day
  if (popularityScore >= 50) return 24; // popular — daily
  if (popularityScore >= 20) return 24 * 3; // moderate — every 3 days
  return 24 * 14; // long tail — biweekly
}

/** Is this product due for a refresh given when it was last verified? */
export function isDueForRefresh(
  popularityScore: number,
  lastVerifiedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastVerifiedAt) return true;
  const dueMs = refreshIntervalHours(popularityScore) * 3_600_000;
  return now.getTime() - lastVerifiedAt.getTime() >= dueMs;
}
