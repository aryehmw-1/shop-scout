/**
 * Layered grocery retrieval — never dead-end on common product searches.
 */

import { CATALOG, type CatalogItem } from "../retailers/catalog";
import { parseBrandFromText, parsePrivateLabelBrand } from "../shopping/brands";
import { parseQueryAttributes, scoreItem } from "../retailers/search";
import { normalizeSearchQuery, suggestCatalogProducts } from "./query-normalize";
import type { ShoppingIntent } from "../types";
import type { ResolvedProduct } from "./types";
import { GROCERY_CATALOG_ALIASES } from "../inventory/verified-inventory-resolver";

export type GroceryRetrievalTier =
  | "exact_sku"
  | "brand_semantic"
  | "category_fallback"
  | "broad_fuzzy";

export interface GroceryRetrievalResult {
  item: CatalogItem;
  resolved: ResolvedProduct;
  tier: GroceryRetrievalTier;
  /** Lower = higher confidence */
  tierRank: number;
  alternatives: Array<{ item: CatalogItem; score: number; tier: GroceryRetrievalTier }>;
}

const GROCERY_CATEGORIES = new Set([
  "salad",
  "dairy",
  "bakery",
  "produce",
  "meat",
  "pantry",
  "household",
]);

export { GROCERY_CATEGORIES };

const GROCERY_PRODUCT_SIGNALS =
  /\b(milk|dairy|chips|crackers?|cheez|snacks?|cereal|coffee|bread|eggs|yogurt|soda|juice|paper|towel|cleaning|produce|meat|pantry|cheese|popcorn|pasta|rice|beans|soup|frozen|butter|cream|cracker|goldfish|pretzels?|granola|bars?)\b/;

/** Normalize hyphenated brand tokens: "cheez-it" ↔ "cheez it" ↔ "cheezit". */
export function expandBrandTokenVariants(text: string): string[] {
  const lower = text.toLowerCase();
  const variants = new Set<string>([lower]);
  variants.add(lower.replace(/-/g, " "));
  variants.add(lower.replace(/\s+/g, "-"));
  variants.add(lower.replace(/[-\s]/g, ""));
  return [...variants];
}

export function brandMatchesText(brand: string, text: string): boolean {
  const blob = text.toLowerCase();
  return expandBrandTokenVariants(brand).some((v) => blob.includes(v));
}

export interface DecomposedGroceryQuery {
  raw: string;
  normalized: string;
  brand?: string;
  privateLabel?: string;
  productTypes: string[];
  category?: string;
  tokens: string[];
}

export function decomposeGroceryQuery(query: string, intent?: Partial<ShoppingIntent>): DecomposedGroceryQuery {
  const normalized = normalizeSearchQuery(query);
  const attrs = parseQueryAttributes(normalized);
  const brand =
    intent?.brand ??
    parsePrivateLabelBrand(normalized) ??
    parseBrandFromText(normalized);
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 1);

  let category = intent?.category ?? attrs.productTypes[0];
  if (!category && /\b(milk|yogurt|cheese|butter|cream)\b/.test(normalized)) category = "dairy";
  if (!category && /\b(chips|crackers?|cereal|coffee|pasta|snacks?|soda|cheez|goldfish|popcorn)\b/.test(normalized))
    category = "pantry";
  if (!category && /\b(paper towels?|detergent|soap|cleaning)\b/.test(normalized)) category = "household";

  return {
    raw: query,
    normalized,
    brand,
    privateLabel: parsePrivateLabelBrand(normalized),
    productTypes: attrs.productTypes,
    category,
    tokens,
  };
}

export function isGroceryQuery(query: string, intent?: Partial<ShoppingIntent>): boolean {
  const d = decomposeGroceryQuery(query, intent);
  if (d.category && GROCERY_CATEGORIES.has(d.category)) return true;
  if (GROCERY_PRODUCT_SIGNALS.test(d.normalized)) return true;
  return d.productTypes.some((t) => GROCERY_PRODUCT_SIGNALS.test(t));
}

function aliasCatalogId(normalized: string): string | undefined {
  for (const [catalogId, aliases] of Object.entries(GROCERY_CATALOG_ALIASES)) {
    for (const alias of aliases) {
      const a = alias.toLowerCase();
      if (normalized === a || normalized.includes(a) || a.includes(normalized)) {
        return catalogId;
      }
    }
  }
  return undefined;
}

function scoreGroceryItem(
  item: CatalogItem,
  decomposed: DecomposedGroceryQuery,
  intent: ShoppingIntent,
  tierHint: GroceryRetrievalTier,
): number {
  const blob = `${item.brand} ${item.title} ${item.keywords.join(" ")}`.toLowerCase();
  let score = scoreItem(item, intent);

  if (decomposed.brand && brandMatchesText(decomposed.brand, blob)) score += 25;
  if (decomposed.normalized && blob.includes(decomposed.normalized)) score += 40;

  for (const t of decomposed.tokens) {
    if (blob.includes(t)) score += 10;
    for (const v of expandBrandTokenVariants(t)) {
      if (v !== t && blob.includes(v)) score += 8;
    }
  }

  if (decomposed.category && item.category === decomposed.category) score += 20;

  if (tierHint === "category_fallback" && decomposed.category === item.category) score += 15;

  return score;
}

function tierFromMatch(
  item: CatalogItem,
  decomposed: DecomposedGroceryQuery,
  score: number,
): GroceryRetrievalTier {
  const blob = `${item.brand} ${item.title}`.toLowerCase();
  if (decomposed.brand && brandMatchesText(decomposed.brand, blob) && decomposed.normalized.includes(blob.split(" ").slice(-2).join(" "))) {
    return "brand_semantic";
  }
  if (decomposed.brand && brandMatchesText(decomposed.brand, blob) && score >= 30) {
    return "brand_semantic";
  }
  if (score >= 45) return "brand_semantic";
  if (decomposed.category && item.category === decomposed.category && score >= 18) {
    return "category_fallback";
  }
  return "broad_fuzzy";
}

const TIER_RANK: Record<GroceryRetrievalTier, number> = {
  exact_sku: 1,
  brand_semantic: 2,
  category_fallback: 3,
  broad_fuzzy: 4,
};

/** Tiered catalog resolution for grocery — always returns best available match. */
export function resolveGroceryProduct(intent: ShoppingIntent): GroceryRetrievalResult | null {
  if (!isGroceryQuery(intent.query, intent)) return null;

  const decomposed = decomposeGroceryQuery(intent.query, intent);
  if (!decomposed.normalized) return null;

  const aliasId = aliasCatalogId(decomposed.normalized);
  if (aliasId) {
    const item = CATALOG.find((c) => c.id === aliasId);
    if (item) {
      return {
        item,
        tier: "brand_semantic",
        tierRank: TIER_RANK.brand_semantic,
        resolved: {
          catalogId: item.id,
          title: item.title,
          brand: item.brand,
          confidence: 0.88,
          matchReason: "grocery_alias_exact",
          synthetic: false,
        },
        alternatives: [],
      };
    }
  }

  const searchIntent: ShoppingIntent = {
    ...intent,
    query: decomposed.normalized,
    brand: decomposed.brand ?? intent.brand,
    category: (decomposed.category ?? intent.category) as ShoppingIntent["category"],
  };

  const scored = CATALOG.filter((item) => GROCERY_CATEGORIES.has(item.category))
    .map((item) => {
      const score = scoreGroceryItem(item, decomposed, searchIntent, "brand_semantic");
      const tier = tierFromMatch(item, decomposed, score);
      return { item, score, tier };
    })
    .filter(({ score }) => score >= 8)
    .sort((a, b) => {
      const tr = TIER_RANK[a.tier] - TIER_RANK[b.tier];
      if (tr !== 0) return tr;
      return b.score - a.score;
    });

  if (scored.length === 0) {
    const suggestions = suggestCatalogProducts(decomposed.normalized, 5);
    if (suggestions.length === 0) return null;
    const hit = suggestions[0]!;
    const item = CATALOG.find((c) => c.id === hit.catalogId);
    if (!item) return null;
    return {
      item,
      tier: "broad_fuzzy",
      tierRank: TIER_RANK.broad_fuzzy,
      resolved: {
        catalogId: item.id,
        title: item.title,
        brand: item.brand,
        confidence: Math.min(0.75, hit.score / 100),
        matchReason: "grocery_broad_fuzzy",
        synthetic: false,
      },
      alternatives: suggestions.slice(1).flatMap((s) => {
        const alt = CATALOG.find((c) => c.id === s.catalogId);
        return alt ? [{ item: alt, score: s.score, tier: "broad_fuzzy" as const }] : [];
      }),
    };
  }

  const top = scored[0]!;
  const confidence =
    top.tier === "brand_semantic" ? 0.9
    : top.tier === "category_fallback" ? 0.78
    : 0.65;

  return {
    item: top.item,
    tier: top.tier,
    tierRank: TIER_RANK[top.tier],
    resolved: {
      catalogId: top.item.id,
      title: top.item.title,
      brand: top.item.brand,
      confidence,
      matchReason: `grocery_${top.tier}`,
      synthetic: false,
    },
    alternatives: scored.slice(1, 4).map((s) => ({
      item: s.item,
      score: s.score,
      tier: s.tier,
    })),
  };
}
