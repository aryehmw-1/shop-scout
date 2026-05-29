import {
  CATALOG,
  createSyntheticCatalogItemForIntent,
  type CatalogItem,
} from "../retailers/catalog";
import {
  parseQueryAttributes,
  queryRequiresCategoryMatch,
  queryRequiresStrictMatch,
  scoreItem,
} from "../retailers/search";
import type { ShoppingIntent } from "../types";
import { normalizeSearchQuery } from "./query-normalize";
import type { ResolvedProduct } from "./types";

/**
 * Multi-signal product resolution: strict apparel filters, type disambiguation,
 * then best scored catalog row, else synthetic SKU from intent.
 */
export function resolvePrimaryProduct(intent: ShoppingIntent): {
  item: CatalogItem;
  resolved: ResolvedProduct;
} {
  const q = normalizeSearchQuery(intent.query.trim());
  const searchIntent = q ? { ...intent, query: q } : intent;

  if (!q) {
    const item = CATALOG[0];
    return {
      item,
      resolved: {
        catalogId: item.id,
        title: item.title,
        brand: item.brand,
        confidence: 0.5,
        matchReason: "default_catalog",
        synthetic: false,
      },
    };
  }

  const strict = queryRequiresStrictMatch(q);
  const categoryStrict = queryRequiresCategoryMatch(q, searchIntent.category);
  const minScore = strict || categoryStrict ? 18 : 10;
  const attrs = parseQueryAttributes(q);

  const scored = CATALOG.map((item) => ({
    item,
    score: scoreItem(item, searchIntent),
  }))
    .filter(({ item, score }) => {
      if (categoryStrict && searchIntent.category && item.category !== searchIntent.category) {
        return false;
      }
      return score >= minScore;
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    let top = scored[0];
    if (
      strict &&
      attrs.productTypes.length > 0 &&
      top.score < minScore + 5 &&
      scored.length > 1
    ) {
      const typed = scored.filter((s) =>
        attrs.productTypes.some(
          (t) =>
            s.item.title.toLowerCase().includes(t) ||
            s.item.keywords.some((k) => k.includes(t)),
        ),
      );
      if (typed[0]) top = typed[0];
    }

    const confidence = Math.min(0.98, 0.55 + top.score / 80);
    return {
      item: top.item,
      resolved: {
        catalogId: top.item.id,
        title: top.item.title,
        brand: top.item.brand,
        confidence,
        matchReason: strict ? "strict_attribute_match" : "catalog_score",
        synthetic: false,
      },
    };
  }

  const item = createSyntheticCatalogItemForIntent(intent);
  return {
    item,
    resolved: {
      catalogId: item.id,
      title: item.title,
      brand: item.brand,
      confidence: 0.72,
      matchReason: "synthetic_from_query",
      synthetic: true,
    },
  };
}
