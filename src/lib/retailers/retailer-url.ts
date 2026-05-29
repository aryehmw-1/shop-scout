import { buildAffiliateUrl } from "../affiliate";
import { buildDirectProductUrl } from "./product-urls";
import { shouldUseStoredProductUrl } from "./product-link-url";
import { buildStoreSearchQuery } from "./store-search-query";
import type { RetailerId, ShoppingIntent } from "../types";

export interface OfferLinkInput {
  id: string;
  slug: string;
  brand: string;
  title: string;
  size: string;
  upc: string;
}

/**
 * Click URL must land on the same retailer as the card — never a mismatched SerpAPI redirect.
 */
export function buildOfferClickUrl(
  retailer: RetailerId,
  item: OfferLinkInput,
  intent: ShoppingIntent,
  liveProductUrl?: string,
): { productUrl: string; affiliateUrl: string } {
  const searchQ = buildStoreSearchQuery(item, intent);
  let productUrl = buildDirectProductUrl(item, retailer, searchQ, intent);

  if (shouldUseStoredProductUrl(liveProductUrl, retailer)) {
    productUrl = liveProductUrl;
  }

  return {
    productUrl,
    affiliateUrl: buildAffiliateUrl(retailer, productUrl),
  };
}
