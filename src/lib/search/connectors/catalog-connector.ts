import {
  compareProduct as catalogCompare,
  searchCatalog as catalogSearch,
  searchSimilarFromLink as catalogLinkSearch,
} from "../../retailers/catalog";
import { enrichOffer } from "../price-engine";
import type { PriceConnector } from "../types";
import type { ProductSearchResults, ShoppingIntent } from "../../types";

function enrichResults(
  results: ProductSearchResults,
  matchConfidence: number,
): ProductSearchResults {
  return {
    ...results,
    local: results.local.map((o) => enrichOffer(o, matchConfidence)),
    online: results.online.map((o) => enrichOffer(o, matchConfidence)),
  };
}

/** Wraps the in-memory catalog + retailer multiplier engine (demo / bootstrap). */
export const catalogConnector: PriceConnector = {
  id: "catalog",
  priority: 10,

  supports(): boolean {
    return true;
  },

  async search(intent: ShoppingIntent): Promise<ProductSearchResults> {
    const raw = catalogSearch(intent);
    return enrichResults(raw, 0.88);
  },
};

export async function compareViaCatalog(
  item: Parameters<typeof catalogCompare>[0],
  intent: ShoppingIntent,
  confidence = 0.92,
): Promise<ProductSearchResults> {
  return enrichResults(catalogCompare(item, intent), confidence);
}

export async function linkSimilarViaCatalog(
  parsed: Parameters<typeof catalogLinkSearch>[0],
  intent: ShoppingIntent,
): Promise<ProductSearchResults> {
  return enrichResults(catalogLinkSearch(parsed, intent), 0.85);
}
