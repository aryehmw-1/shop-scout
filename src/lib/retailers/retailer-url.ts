import { buildAffiliateUrl } from "../affiliate";
import {
  productUrlMatchesRetailer,
} from "../matching/url-parser";
import { buildDirectProductUrl } from "./product-urls";
import { buildFullSearchQuery } from "../shopping/intent-merge";
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
  const searchQ = buildFullSearchQuery(intent);
  let productUrl = buildDirectProductUrl(item, retailer, searchQ);

  if (
    liveProductUrl?.startsWith("http") &&
    productUrlMatchesRetailer(liveProductUrl, retailer)
  ) {
    productUrl = liveProductUrl;
  }

  return {
    productUrl,
    affiliateUrl: buildAffiliateUrl(retailer, productUrl),
  };
}
