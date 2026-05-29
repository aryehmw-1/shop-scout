/**
 * Consumer-facing trust gates — stricter than persist validation.
 * Offers must pass ALL checks before appearing in search, compare, or link results.
 */

import { isGenericCatalogImage, isRetailerHostedImage } from "../indexing/retailer-page-image";
import type { ProductOffer } from "../types";
import { isPdpProductUrl, isSearchProductUrl } from "./url-classifier";
import { isVerifiedOffer } from "./offer-trust";

/** Minimum match confidence for consumer UI (raised from persist floor 0.58). */
export const MIN_CONSUMER_MATCH_CONFIDENCE = 0.72;

/** Minimum image quality score — rejects placeholders and low-res thumbs. */
export const MIN_CONSUMER_IMAGE_CONFIDENCE = 0.4;

/** Minimum identity confidence when no exact UPC/GTIN match reason present. */
export const MIN_CONSUMER_IDENTITY_CONFIDENCE = 0.65;

/** Best-deal badge requires even higher confidence for link/compare flows. */
export const MIN_CONSUMER_BEST_DEAL_CONFIDENCE = 0.78;

/** Max age for cached/indexed quotes shown as live (ms). */
export const CONSUMER_QUOTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const PLACEHOLDER_IMAGE =
  /unsplash\.com|placeholder|via\.placeholder|dummyimage|placehold\.co/i;

export function isQuoteFreshForDisplay(offer: ProductOffer): boolean {
  const now = Date.now();

  if (offer.priceExpiresAt) {
    return new Date(offer.priceExpiresAt).getTime() > now;
  }

  if (offer.priceAsOf) {
    return now - new Date(offer.priceAsOf).getTime() <= CONSUMER_QUOTE_MAX_AGE_MS;
  }

  // Search-time scrape / API — treated as fresh when just fetched
  if (offer.priceSource === "scraped" || offer.priceSource === "connector_api") {
    return true;
  }

  return false;
}

export function passesImageTrustGate(offer: ProductOffer): boolean {
  if (!offer.imageUrl?.startsWith("https://")) return false;
  if (isGenericCatalogImage(offer.imageUrl)) return false;
  if (PLACEHOLDER_IMAGE.test(offer.imageUrl)) return false;

  const imgConf = offer.imageConfidence ?? 0;
  if (imgConf > 0 && imgConf < MIN_CONSUMER_IMAGE_CONFIDENCE) return false;

  // Prefer retailer-hosted product images; allow high-confidence extracted images
  if (
    !isRetailerHostedImage(offer.imageUrl, offer.retailer) &&
    imgConf < MIN_CONSUMER_IMAGE_CONFIDENCE
  ) {
    return false;
  }

  return true;
}

export function passesIdentifierAlignment(offer: ProductOffer): boolean {
  const reasons = offer.confidenceReasons ?? [];
  const hasExactId = reasons.some((r) =>
    /upc|gtin|asin|identifier\.exact/i.test(r.code),
  );

  if (hasExactId) return true;

  const identity = offer.identityConfidence ?? offer.matchConfidence ?? 0;
  return identity >= MIN_CONSUMER_IDENTITY_CONFIDENCE;
}

export function passesRetailerLinkGate(offer: ProductOffer): boolean {
  if (!offer.productUrl) return false;
  if (isSearchProductUrl(offer.productUrl)) return false;
  if (!isPdpProductUrl(offer.productUrl)) return false;
  if (/explore-all|\/pages\/explore/i.test(offer.productUrl)) return false;
  return true;
}

/** Full consumer trust gate — use for main UI display. */
export function passesConsumerTrustGates(offer: ProductOffer): boolean {
  if (!isVerifiedOffer(offer)) return false;
  if (offer.pipelineDebug?.validationStatus === "rejected") return false;
  if ((offer.matchConfidence ?? 0) < MIN_CONSUMER_MATCH_CONFIDENCE) return false;
  if (!offer.price || offer.price <= 0) return false;
  if (!passesRetailerLinkGate(offer)) return false;
  if (!passesImageTrustGate(offer)) return false;
  if (!passesIdentifierAlignment(offer)) return false;
  if (!isQuoteFreshForDisplay(offer)) return false;
  return true;
}

export function shouldShowConsumerBestDeal(offer: ProductOffer): boolean {
  return (
    passesConsumerTrustGates(offer) &&
    (offer.matchConfidence ?? 0) >= MIN_CONSUMER_BEST_DEAL_CONFIDENCE
  );
}
