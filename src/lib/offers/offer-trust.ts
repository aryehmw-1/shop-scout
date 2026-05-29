import { isGenericCatalogImage } from "../indexing/retailer-page-image";
import { isRetailerHostedImage } from "../indexing/retailer-page-image";
import { isVerifiedLivePrice } from "../search/price-truth";
import type { ProductOffer } from "../types";
import { MIN_CONSUMER_BEST_DEAL_CONFIDENCE } from "./consumer-trust";
import { MIN_TRUSTED_MATCH_CONFIDENCE } from "./offer-quality";
import { classifyProductUrl, isPdpProductUrl, isSearchProductUrl } from "./url-classifier";

/** Minimum confidence to show "Best deal" badge. */
export const BEST_DEAL_MIN_CONFIDENCE = MIN_CONSUMER_BEST_DEAL_CONFIDENCE;

export type OfferTrustTier = "verified" | "estimated";

export function offerTrustTier(offer: ProductOffer): OfferTrustTier {
  if (isVerifiedOffer(offer)) return "verified";
  return "estimated";
}

export function isVerifiedOffer(offer: ProductOffer): boolean {
  if ((offer.matchConfidence ?? 0) < MIN_TRUSTED_MATCH_CONFIDENCE) return false;
  if (isSearchProductUrl(offer.productUrl)) return false;
  if (offer.priceSource === "catalog_model") return false;
  if (offer.priceSource === "daily_index" || offer.priceSource === "nightly_index") {
    return false;
  }
  if (offer.priceSource === "cached_quote") return false;
  if (!isVerifiedLivePrice(offer)) return false;
  if (!offer.price || offer.price <= 0) return false;
  if (offer.priceSource === "connector_api") return true;
  if (offer.priceSource === "scraped") {
    return isPdpProductUrl(offer.productUrl);
  }
  return false;
}

export function isEstimatedOffer(offer: ProductOffer): boolean {
  return !isVerifiedOffer(offer);
}

export function shouldShowBestDealBadge(offer: ProductOffer): boolean {
  return (
    (Boolean(offer.isBestDeal) || offer.dealLabel === "best_deal") &&
    isVerifiedOffer(offer) &&
    (offer.matchConfidence ?? 0) >= BEST_DEAL_MIN_CONFIDENCE
  );
}

export function hasUniqueRetailerImage(offer: ProductOffer): boolean {
  return (
    offer.imageUrl?.startsWith("https://") === true &&
    !isGenericCatalogImage(offer.imageUrl) &&
    isRetailerHostedImage(offer.imageUrl, offer.retailer)
  );
}

export function offerTrustLabel(offer: ProductOffer): string {
  return isVerifiedOffer(offer) ? "Verified offer" : "Estimated · verify at retailer";
}

export function offerUrlKind(offer: ProductOffer): string {
  return classifyProductUrl(offer.productUrl);
}
