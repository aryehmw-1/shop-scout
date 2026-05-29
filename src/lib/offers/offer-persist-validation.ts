import { isGenericCatalogImage } from "../indexing/retailer-page-image";
import { isRetailerHostedImage } from "../indexing/retailer-page-image";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, ShoppingIntent } from "../types";
import { validateAmazonOffer } from "./amazon-validation";
import {
  isPlausiblePrice,
  isPlausibleScrapedPrice,
  MIN_TRUSTED_MATCH_CONFIDENCE,
} from "./offer-quality";
import { inferRetailerStatus } from "./retailer-enrichment-status";
import { isPdpProductUrl, isSearchProductUrl } from "./url-classifier";
import { passesConsumerTrustGates } from "./consumer-trust";

export type PersistRejectionReason =
  | "non_persistable_source"
  | "missing_price"
  | "absurd_price"
  | "category_price_mismatch"
  | "missing_pdp_url"
  | "search_or_catalog_url"
  | "placeholder_image"
  | "duplicate_image"
  | "low_confidence"
  | "blocked_retailer"
  | "amazon_mismatch"
  | "fetch_failed"
  | "no_parser_match"
  | "generic_catalog_page";

const GROCERY_CATEGORIES = new Set([
  "salad",
  "dairy",
  "bakery",
  "produce",
  "meat",
  "pantry",
  "household",
]);

const APPAREL_CATEGORIES = new Set(["clothing", "shoes"]);

const PERSISTABLE_SOURCES = new Set<ProductOffer["priceSource"]>([
  "scraped",
  "connector_api",
]);

export interface PersistValidationResult {
  ok: boolean;
  reason?: PersistRejectionReason;
  detail?: string;
  retailerStatus?: import("./retailer-enrichment-status").RetailerEnrichmentStatus;
}

function categoryPriceCeiling(category: string | undefined, price: number): string | null {
  if (GROCERY_CATEGORIES.has(category ?? "") && price > 80) {
    return `grocery price $${price} exceeds ceiling`;
  }
  if (APPAREL_CATEGORIES.has(category ?? "") && price > 350) {
    return `apparel price $${price} exceeds ceiling`;
  }
  return null;
}

function isPlaceholderImage(url: string | undefined): boolean {
  if (!url?.startsWith("https://")) return true;
  if (isGenericCatalogImage(url)) return true;
  if (/unsplash\.com|placeholder|via\.placeholder|dummyimage/i.test(url)) return true;
  return false;
}

/**
 * Final gate before writing an offer to SQLite.
 * Only scraped / connector_api rows with PDP + sane price pass.
 */
export function validateOfferBeforePersist(
  offer: ProductOffer,
  item: CatalogItem,
  intent?: ShoppingIntent,
  options: {
    seenImages?: Set<string>;
    seenAsins?: Set<string>;
    retailerStatus?: import("./retailer-enrichment-status").RetailerEnrichmentStatus;
  } = {},
): PersistValidationResult {
  const source = offer.priceSource ?? "catalog_model";

  if (!PERSISTABLE_SOURCES.has(source)) {
    return { ok: false, reason: "non_persistable_source", detail: source };
  }

  if (options.retailerStatus === "blocked") {
    return { ok: false, reason: "blocked_retailer", retailerStatus: "blocked" };
  }

  if (options.retailerStatus === "parser_missing" || options.retailerStatus === "no_match") {
    return {
      ok: false,
      reason: options.retailerStatus === "parser_missing" ? "no_parser_match" : "fetch_failed",
      retailerStatus: options.retailerStatus,
    };
  }

  if (!offer.price || offer.price <= 0 || !isPlausibleScrapedPrice(offer.price)) {
    return { ok: false, reason: "missing_price" };
  }

  if (offer.price > 500) {
    return { ok: false, reason: "absurd_price", detail: `price $${offer.price}` };
  }

  const categoryIssue = categoryPriceCeiling(item.category, offer.price);
  if (categoryIssue) {
    return { ok: false, reason: "category_price_mismatch", detail: categoryIssue };
  }

  if (!isPlausiblePrice(offer.price, item.basePrice)) {
    return {
      ok: false,
      reason: "category_price_mismatch",
      detail: `price $${offer.price} vs catalog $${item.basePrice}`,
    };
  }

  if (!isPdpProductUrl(offer.productUrl)) {
    return {
      ok: false,
      reason: isSearchProductUrl(offer.productUrl) ? "search_or_catalog_url" : "missing_pdp_url",
      detail: offer.productUrl?.slice(0, 120),
    };
  }

  if (/explore-all|\/pages\/explore/i.test(offer.productUrl)) {
    return { ok: false, reason: "generic_catalog_page", detail: offer.productUrl };
  }

  if (isPlaceholderImage(offer.imageUrl)) {
    return { ok: false, reason: "placeholder_image" };
  }

  if (
    offer.imageUrl &&
    options.seenImages?.has(offer.imageUrl) &&
    !isRetailerHostedImage(offer.imageUrl, offer.retailer)
  ) {
    return { ok: false, reason: "duplicate_image" };
  }

  if ((offer.matchConfidence ?? 0) < MIN_TRUSTED_MATCH_CONFIDENCE) {
    return {
      ok: false,
      reason: "low_confidence",
      detail: `matchConfidence=${offer.matchConfidence}`,
      retailerStatus: "low_confidence",
    };
  }

  if (offer.retailer === "amazon") {
    const amazon = validateAmazonOffer(offer, item, intent, options.seenAsins);
    if (!amazon.accepted) {
      return {
        ok: false,
        reason: "amazon_mismatch",
        detail: amazon.rejectionReason,
        retailerStatus: "low_confidence",
      };
    }
  }

  return { ok: true, retailerStatus: "success" };
}

export function filterOffersForPersist(
  offers: ProductOffer[],
  item: CatalogItem,
  intent?: ShoppingIntent,
): { accepted: ProductOffer[]; rejected: Array<{ offer: ProductOffer; result: PersistValidationResult }> } {
  const seenImages = new Set<string>();
  const seenAsins = new Set<string>();
  const accepted: ProductOffer[] = [];
  const rejected: Array<{ offer: ProductOffer; result: PersistValidationResult }> = [];

  for (const offer of offers) {
    const result = validateOfferBeforePersist(offer, item, intent, { seenImages, seenAsins });
    if (result.ok) {
      accepted.push(offer);
      if (offer.imageUrl) seenImages.add(offer.imageUrl);
      const asin = offer.productUrl.match(/\/dp\/([A-Z0-9]{10})/i)?.[1];
      if (asin) seenAsins.add(asin.toUpperCase());
    } else {
      rejected.push({ offer, result });
    }
  }

  return { accepted, rejected };
}

/** Stricter than isVerifiedOffer — consumer UI trust gates (image, identifiers, freshness). */
export function isDisplayableOffer(offer: ProductOffer): boolean {
  return passesConsumerTrustGates(offer);
}

export function showEstimatedOffersInUi(): boolean {
  const raw = process.env.NEXT_PUBLIC_SHOW_ESTIMATED_OFFERS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}
