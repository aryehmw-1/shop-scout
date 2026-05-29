import {
  buildRetailerSearchUrl,
  buildStoreProductLink,
  googleShoppingFallback,
} from "../affiliate";
import { buildStoreSearchQuery } from "./store-search-query";
import type { RetailerId, ShoppingIntent } from "../types";

export interface ProductLinkItem {
  id: string;
  slug: string;
  brand: string;
  title: string;
  size: string;
  upc: string;
}

export function productSearchQuery(
  item: ProductLinkItem,
  userQuery?: string,
  intent?: ShoppingIntent,
): string {
  if (intent) {
    return buildStoreSearchQuery(item, intent);
  }
  if (userQuery?.trim()) {
    return buildStoreSearchQuery(item, { query: userQuery.trim() } as ShoppingIntent);
  }
  return buildStoreSearchQuery(item);
}

/**
 * Store search link with the user's product terms (never placeholder PDP IDs).
 */
export function buildDirectProductUrl(
  item: ProductLinkItem,
  retailer: RetailerId,
  userQuery?: string,
  intent?: ShoppingIntent,
): string {
  const searchQ = productSearchQuery(item, userQuery, intent);
  try {
    return buildRetailerSearchUrl(retailer, searchQ);
  } catch {
    return googleShoppingFallback(searchQ);
  }
}

export { buildStoreProductLink };
