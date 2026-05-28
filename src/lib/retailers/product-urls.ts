import {
  buildRetailerSearchUrl,
  buildStoreProductLink,
  googleShoppingFallback,
} from "../affiliate";
import type { RetailerId } from "../types";

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
): string {
  const base = `${item.brand} ${item.title} ${item.size}`.replace(/\s+/g, " ").trim();
  if (!userQuery?.trim()) return base;
  const q = userQuery.trim();
  if (base.toLowerCase().includes(q.toLowerCase().slice(0, 8))) return base;
  return `${q} ${base}`.replace(/\s+/g, " ").trim();
}

/**
 * Store search link with the user's product terms (never placeholder PDP IDs).
 */
export function buildDirectProductUrl(
  item: ProductLinkItem,
  retailer: RetailerId,
  userQuery?: string,
): string {
  const searchQ = productSearchQuery(item, userQuery);
  try {
    return buildRetailerSearchUrl(retailer, searchQ);
  } catch {
    return googleShoppingFallback(searchQ);
  }
}

export { buildStoreProductLink };
