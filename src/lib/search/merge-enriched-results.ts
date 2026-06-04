import type { ProductOffer, ProductSearchResults } from "@/lib/types";

/** Merge enrichment offers without replacing the whole result tree (reduces UI flash). */
export function mergeEnrichedSearchResults(
  base: ProductSearchResults,
  enriched: ProductSearchResults,
): ProductSearchResults {
  const byId = new Map<string, ProductOffer>();
  for (const o of base.online) byId.set(o.id, o);
  for (const o of enriched.online) byId.set(o.id, o);

  const online = [...byId.values()].sort((a, b) => a.price - b.price);

  return {
    ...base,
    ...enriched,
    matchedProduct: enriched.matchedProduct ?? base.matchedProduct,
    online,
    enrichmentPending: false,
    enrichmentCatalogId: enriched.enrichmentCatalogId ?? base.enrichmentCatalogId,
  };
}
