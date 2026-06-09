import { CATALOG } from "../retailers/catalog";
import type { ProductOffer } from "../types";

/** Words that carry no product identity — drop them before relevance matching. */
const RELEVANCE_STOPWORDS = new Set([
  "best", "price", "prices", "cheap", "cheaper", "cheapest", "buy", "deal", "deals",
  "online", "near", "the", "for", "and", "with", "find", "lowest", "compare", "shop",
  "shopping", "where", "can", "get", "good", "great", "top", "new", "sale", "off",
  "discount", "store", "stores", "available", "please", "show", "looking", "need",
]);

/** Light singular stem so "eggs"/"egg" and "towels"/"towel" match. */
function stem(w: string): string {
  return w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w;
}

export function relevanceTokens(s: string | undefined | null): string[] {
  if (!s) return [];
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length > 2 && !RELEVANCE_STOPWORDS.has(w))
    .map(stem);
}

/**
 * Conservative spurious-match guard. The catalog scorer can return an unrelated
 * product (e.g. eggs for "Beats Studio Pro"). We only reject a match when the
 * search query shares ZERO meaningful tokens with every shown offer and its
 * catalog entry — so legitimate category matches ("headphones" → Beats) and
 * synthetic/live results (which echo the query) always pass.
 */
export function matchLooksIrrelevant(
  searchQuery: string | undefined,
  offers: ProductOffer[],
): boolean {
  const qTokens = relevanceTokens(searchQuery);
  if (qTokens.length === 0 || offers.length === 0) return false;

  const offerTokens = new Set<string>();
  for (const o of offers) {
    relevanceTokens(o.title).forEach((t) => offerTokens.add(t));
    relevanceTokens(o.brand).forEach((t) => offerTokens.add(t));
    const item = o.catalogId ? CATALOG.find((c) => c.id === o.catalogId) : undefined;
    if (item) {
      relevanceTokens(item.title).forEach((t) => offerTokens.add(t));
      relevanceTokens(item.brand).forEach((t) => offerTokens.add(t));
      for (const k of item.keywords ?? []) relevanceTokens(k).forEach((t) => offerTokens.add(t));
    }
  }
  if (offerTokens.size === 0) return false;

  const overlaps = qTokens.some((q) => offerTokens.has(q));
  return !overlaps;
}
