/**
 * Production-grade flagship inventory — UPC-heavy grocery/household only.
 * Indexing and Phase 0 refresh target these IDs first; apparel/shoes are deprioritized.
 */

/** Categories excluded from automated indexing until matching reliability improves. */
export const DEPRIORITIZED_INDEX_CATEGORIES = new Set([
  "clothing",
  "shoes",
  "bedding",
]);

/**
 * Curated flagship set (~22 products) — simple variants, UPC-backed, high retailer overlap potential.
 * Target: 15–30 production-usable before any catalog expansion.
 */
export const FLAGSHIP_CATALOG_IDS: readonly string[] = [
  // Pantry / snacks
  "pasta-spaghetti",
  "coffee-ground",
  "cereal-honey",
  "super-pretzel",
  "potato-chips",
  "microwave-popcorn",
  "cheese-crackers",
  "bread-wheat",
  // Dairy / beverages
  "milk-whole-gal",
  "milk-og-half",
  "eggs-dozen",
  "butter-salted",
  "yogurt-greek",
  "oj-juice",
  // Household
  "paper-towels",
  // Produce / salad / meat
  "bananas-bunch",
  "spinach-og-10",
  "spring-mix-5",
  "romaine-hearts-3",
  "arugula-og-5",
  "chicken-breast",
  "ground-beef",
] as const;

const flagshipSet = new Set<string>(FLAGSHIP_CATALOG_IDS);

export function getFlagshipCatalogIds(): string[] {
  return [...FLAGSHIP_CATALOG_IDS];
}

export function isFlagshipCatalogId(catalogId: string): boolean {
  return flagshipSet.has(catalogId);
}

export function isDeprioritizedForIndexing(category: string): boolean {
  return DEPRIORITIZED_INDEX_CATEGORIES.has(category);
}

export function flagshipOnlyIndexingEnabled(): boolean {
  const raw = process.env.INDEX_FLAGSHIP_ONLY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}
