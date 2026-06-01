/**
 * Production-grade flagship inventory — UPC-heavy grocery/household only.
 * Indexing and Phase 0 refresh target these IDs first.
 */

export const DEPRIORITIZED_INDEX_CATEGORIES = new Set([
  "clothing",
  "shoes",
  "bedding",
]);

/** Flagship grocery set — high retailer overlap, UPC-backed where possible. */
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
  "granola-bars",
  "peanut-butter",
  "mac-cheese",
  // Beverages
  "cola-classic-12",
  "pepsi-12pk",
  "sparkling-water-12",
  "oj-juice",
  // Dairy
  "milk-whole-gal",
  "milk-og-half",
  "eggs-dozen",
  "butter-salted",
  "yogurt-greek",
  // Household / cleaning
  "paper-towels",
  "toilet-paper-12",
  "dish-soap",
  "laundry-detergent",
  // Frozen
  "frozen-pizza",
  "frozen-vegetables",
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
