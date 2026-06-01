/**
 * Build user-visible retrieval normalization copy from tier + match context.
 */

import type { GroceryRetrievalTier } from "./grocery-retrieval";
import type { RetrievalMeta } from "../types";

const TIER_LABELS: Record<string, string> = {
  exact_sku: "Exact catalog match",
  brand_semantic: "Brand + product match",
  category_fallback: "Category alternatives",
  broad_fuzzy: "Closest semantic match",
};

export function tierDisplayLabel(tier?: string): string {
  if (!tier) return "Catalog match";
  return TIER_LABELS[tier] ?? tier.replace(/_/g, " ");
}

export function offerQualityLabel(quality?: RetrievalMeta["offerQuality"]): string {
  switch (quality) {
    case "exact":
      return "Exact match";
    case "verified":
      return "Verified price";
    case "estimated":
      return "Estimated price";
    case "closest_match":
      return "Closest match";
    default:
      return "Match";
  }
}

export function buildRetrievalNormalizationMessage(
  query: string,
  opts: {
    tier?: string;
    matchedTitle?: string;
    matchedBrand?: string;
    closestMatchFallback?: boolean;
  },
): string {
  const q = query.trim();
  const product = [opts.matchedBrand, opts.matchedTitle].filter(Boolean).join(" ").trim();

  if (opts.closestMatchFallback) {
    if (/cheez/i.test(q)) {
      return `Showing closest matches for Cheez-It crackers`;
    }
    if (product) {
      return `Showing closest matches for ${product}`;
    }
    return `Showing closest matches for “${q}”`;
  }

  switch (opts.tier) {
    case "exact_sku":
      return product ? `Exact match: ${product}` : `Exact match for “${q}”`;
    case "brand_semantic":
      return product ? `Matched ${product}` : `Brand match for “${q}”`;
    case "category_fallback":
      return product
        ? `Showing ${product} and similar items in this category`
        : `Showing category alternatives for “${q}”`;
    case "broad_fuzzy":
      return product
        ? `Closest catalog match: ${product}`
        : `Closest matches for “${q}”`;
    default:
      return product ? `Showing prices for ${product}` : `Showing results for “${q}”`;
  }
}

export function buildRetrievalMetaFromGrocery(
  query: string,
  grocery: {
    tier: GroceryRetrievalTier;
    item: { id: string; title: string; brand: string };
    resolved: { matchReason: string; confidence: number };
  },
  closestMatchFallback?: boolean,
): RetrievalMeta {
  const offerQuality: RetrievalMeta["offerQuality"] =
    closestMatchFallback ? "closest_match"
    : grocery.tier === "exact_sku" || grocery.tier === "brand_semantic" ? "estimated"
    : "closest_match";

  return {
    tier: grocery.tier,
    matchReason: grocery.resolved.matchReason,
    confidence: grocery.resolved.confidence,
    catalogId: grocery.item.id,
    matchedTitle: grocery.item.title,
    matchedBrand: grocery.item.brand,
    offerQuality,
    normalizationMessage: buildRetrievalNormalizationMessage(query, {
      tier: grocery.tier,
      matchedTitle: grocery.item.title,
      matchedBrand: grocery.item.brand,
      closestMatchFallback,
    }),
  };
}
