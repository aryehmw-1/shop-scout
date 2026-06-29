import { isGenericCatalogImage } from "../indexing/retailer-page-image";
import { isRetailerHostedImage } from "../indexing/retailer-page-image";
import { isVerifiedLivePrice } from "../search/price-truth";
import type { ProductOffer } from "../types";
// Import from the leaf thresholds module (NOT consumer-trust) — consumer-trust
// imports offer-trust, so importing it back here is a cycle that crashed the build.
import { MIN_CONSUMER_BEST_DEAL_CONFIDENCE } from "./consumer-trust-thresholds";
import { isAuthoritativeMatchBand } from "./product-match-analysis";
import { MIN_TRUSTED_MATCH_CONFIDENCE } from "./offer-quality";
import { classifyProductUrl, isPdpProductUrl, isSearchProductUrl } from "./url-classifier";

/** Minimum confidence to show "Best deal" badge. */
export const BEST_DEAL_MIN_CONFIDENCE = MIN_CONSUMER_BEST_DEAL_CONFIDENCE;

export type OfferTrustTier = "verified" | "estimated";

export function offerTrustTier(offer: ProductOffer): OfferTrustTier {
  if (isVerifiedOffer(offer)) return "verified";
  return "estimated";
}

export function isPersistedVerifiedOffer(offer: ProductOffer): boolean {
  return Boolean(offer.verifiedPersistedInventory);
}

export function isVerifiedOffer(offer: ProductOffer): boolean {
  if (isPersistedVerifiedOffer(offer)) {
    if ((offer.matchConfidence ?? 0) < MIN_TRUSTED_MATCH_CONFIDENCE) return false;
    if (isSearchProductUrl(offer.productUrl)) return false;
    if (!offer.price || offer.price <= 0) return false;
    if (!isPdpProductUrl(offer.productUrl)) return false;
    return offer.priceSource === "scraped" || offer.priceSource === "connector_api";
  }

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
    offer.matchBand !== "rejected" &&
    offer.matchBand !== "weak" &&
    (isAuthoritativeMatchBand(offer.matchBand) || offer.matchBand === "likely_match" || !offer.matchBand) &&
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
