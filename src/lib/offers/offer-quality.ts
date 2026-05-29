import { titleSimilarity } from "../catalog/title-similarity";
import { isGenericCatalogImage } from "../indexing/retailer-page-image";
import { isRetailerHostedImage } from "../indexing/retailer-page-image";
import { scoreImageQuality } from "../identity/image-quality";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, ShoppingIntent } from "../types";
import {
  logAmazonMatchDecision,
  validateAmazonOffer,
} from "./amazon-validation";
import {
  amazonNormalizationEnabled,
  normalizeAmazonListingPrice,
} from "./amazon-normalization";
import { attachPipelineDebug } from "./offer-pipeline-meta";
import type { RetailerPageExtraction } from "./retailer-page-extract";
import {
  classifyProductUrl,
  isPdpProductUrl,
  isSearchProductUrl,
  type ProductUrlKind,
} from "./url-classifier";

/** Minimum match confidence to treat an offer as user-trustworthy. */
export const MIN_TRUSTED_MATCH_CONFIDENCE = 0.58;

/** Minimum title overlap (no UPC) before we trust a match. */
export const MIN_TITLE_SIMILARITY = 0.42;

export interface OfferQualityMeta {
  urlKind: ProductUrlKind;
  priceConfidence: number;
  extractionSource?: ProductOffer["priceSource"];
}

/** Absolute bounds for PDP-scraped prices (do not reject real sale prices vs stale catalog). */
export function isPlausibleScrapedPrice(priceUsd: number): boolean {
  return Number.isFinite(priceUsd) && priceUsd >= 0.25 && priceUsd <= 50_000;
}

export function isPlausiblePrice(
  priceUsd: number,
  catalogBase: number,
  toleranceRatio = 0.55,
): boolean {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return false;
  if (!Number.isFinite(catalogBase) || catalogBase <= 0) return true;
  const ratio = priceUsd / catalogBase;
  return ratio >= toleranceRatio && ratio <= 1 / toleranceRatio;
}

function appendReason(
  offer: ProductOffer,
  code: string,
  message: string,
  weight: number,
): void {
  const reasons = [...(offer.confidenceReasons ?? [])];
  if (!reasons.some((r) => r.code === code)) {
    reasons.push({ code, message, weight });
  }
  offer.confidenceReasons = reasons;
}

function penalize(offer: ProductOffer, factor: number, code: string, message: string): void {
  offer.matchConfidence = Math.max(0.05, (offer.matchConfidence ?? 0.5) * factor);
  appendReason(offer, code, message, -0.15);
}

export function buildOfferQualityMeta(offer: ProductOffer): OfferQualityMeta {
  const urlKind = classifyProductUrl(offer.productUrl);
  let priceConfidence = 0.35;

  if (offer.priceSource === "connector_api") priceConfidence = 0.92;
  else if (offer.priceSource === "scraped") priceConfidence = 0.78;
  else if (offer.priceSource === "cached_quote" || offer.priceSource === "daily_index") {
    priceConfidence = isPdpProductUrl(offer.productUrl) ? 0.65 : 0.4;
  } else if (offer.priceSource === "catalog_model") priceConfidence = 0.22;

  if (isSearchProductUrl(offer.productUrl)) priceConfidence *= 0.5;
  if (isGenericCatalogImage(offer.imageUrl)) priceConfidence *= 0.85;

  return {
    urlKind,
    priceConfidence: Math.min(1, priceConfidence),
    extractionSource: offer.priceSource,
  };
}

export function applyOfferQualityGates(
  offer: ProductOffer,
  item: CatalogItem,
  intent: ShoppingIntent,
): ProductOffer {
  const o = { ...offer };
  const meta = buildOfferQualityMeta(o);

  if (meta.urlKind === "search") {
    penalize(o, 0.72, "url.search", "search URL not product page");
    o.priceNote = o.priceNote ?? "Search link · verify product on site";
  } else if (meta.urlKind === "homepage" || meta.urlKind === "invalid") {
    penalize(o, 0.45, "url.invalid", "broken or generic store URL");
  }

  if (o.priceSource === "catalog_model") {
    penalize(o, 0.82, "price.estimated", "estimated catalog price");
    if (!o.priceNote?.includes("Estimated")) {
      o.priceNote = "Estimated price · verify at store";
    }
  }

  if (isGenericCatalogImage(o.imageUrl)) {
    penalize(o, 0.88, "image.generic", "shared catalog fallback image");
    o.imageSource = o.imageSource ?? "catalog";
  } else if (
    o.imageUrl?.startsWith("https://") &&
    !isRetailerHostedImage(o.imageUrl, o.retailer)
  ) {
    penalize(o, 0.92, "image.third_party", "non-retailer image host");
  }

  const titleSim = titleSimilarity(
    item.title,
    o.storeTitle ?? o.title,
  );
  if (titleSim < MIN_TITLE_SIMILARITY && (o.identityConfidence ?? 0) < 0.99) {
    penalize(o, 0.75, "title.weak", "weak title match to catalog");
  }

  if (
    o.priceSource === "scraped" &&
    !isPlausiblePrice(o.price, item.basePrice)
  ) {
    penalize(o, 0.92, "price.catalog-drift", "scraped price differs from catalog");
  }

  o.matchConfidence = Math.min(o.matchConfidence ?? 0.5, meta.priceConfidence + 0.15);
  return o;
}

export function applyRetailerExtractionToOffer(
  offer: ProductOffer,
  extraction: RetailerPageExtraction,
  item: CatalogItem,
): ProductOffer {
  const o = { ...offer };

  if (extraction.canonicalPdpUrl && isPdpProductUrl(extraction.canonicalPdpUrl)) {
    o.productUrl = extraction.canonicalPdpUrl;
    appendReason(o, "url.pdp", "resolved product detail page", 0.2);
  } else if (isPdpProductUrl(extraction.finalUrl)) {
    o.productUrl = extraction.finalUrl;
  }

  if (extraction.imageUrl) {
    const q = scoreImageQuality(extraction.imageUrl);
    if (q.imageQualityScore >= 0.35) {
      o.imageUrl = extraction.imageUrl;
      o.imageSource = "retailer";
      o.imageConfidence = q.imageQualityScore;
      appendReason(o, "image.retailer", "retailer PDP image", 0.12);
    }
  }

  const resolvedUrl =
    extraction.canonicalPdpUrl && isPdpProductUrl(extraction.canonicalPdpUrl) ?
      extraction.canonicalPdpUrl
    : isPdpProductUrl(extraction.finalUrl) ? extraction.finalUrl
    : o.productUrl;
  if (
    extraction.resolvedVia === "paapi_fallback" &&
    extraction.priceUsd &&
    isPlausibleScrapedPrice(extraction.priceUsd)
  ) {
    if (extraction.canonicalPdpUrl && isPdpProductUrl(extraction.canonicalPdpUrl)) {
      o.productUrl = extraction.canonicalPdpUrl;
      appendReason(o, "url.pdp", "resolved product detail page", 0.2);
    } else if (isPdpProductUrl(extraction.finalUrl)) {
      o.productUrl = extraction.finalUrl;
    }
    if (extraction.imageUrl) {
      const q = scoreImageQuality(extraction.imageUrl);
      if (q.imageQualityScore >= 0.35) {
        o.imageUrl = extraction.imageUrl;
        o.imageSource = "retailer";
        o.imageConfidence = q.imageQualityScore;
      }
    }
    if (extraction.storeTitle) o.storeTitle = extraction.storeTitle;
    o.price = extraction.priceUsd;
    o.landedCost = extraction.priceUsd;
    o.unitPrice = extraction.priceUsd;
    o.priceSource = "connector_api";
    o.priceAsOf = new Date().toISOString();
    o.priceNote = "Price from Amazon PA-API · refreshed overnight";
    appendReason(o, "price.paapi", "Amazon Product Advertising API", 0.22);
    return applyOfferQualityGates(o, item, intentFromItem(item));
  }

  const trustExtractedPrice =
    isPdpProductUrl(resolvedUrl) &&
    (extraction.urlKind !== "search" || extraction.searchResolved === true);

  if (
    extraction.priceUsd &&
    isPlausibleScrapedPrice(extraction.priceUsd) &&
    trustExtractedPrice
  ) {
    let priceToApply = extraction.priceUsd;
    let priceNote = "Price from retailer page · verify at checkout";
    const storeTitle = extraction.storeTitle ?? o.storeTitle ?? o.title;

    if (!isPlausiblePrice(extraction.priceUsd, item.basePrice)) {
      if (o.retailer === "amazon" && amazonNormalizationEnabled()) {
        const norm = normalizeAmazonListingPrice(
          extraction.priceUsd,
          storeTitle,
          item,
        );
        if (norm.accepted) {
          priceToApply = norm.normalizedPrice;
          priceNote =
            norm.method === "direct" ?
              priceNote
            : `Normalized from $${norm.rawPrice.toFixed(2)} (${norm.reason}) · verify at checkout`;
          appendReason(
            o,
            "price.normalized",
            `${norm.method}: ${norm.reason}`,
            0.12,
          );
        } else {
          appendReason(
            o,
            "price.bulk-rejected",
            norm.reason,
            -0.2,
          );
        }
      } else {
        appendReason(
          o,
          "price.search-rejected",
          "scraped price ignored (not plausible vs catalog)",
          -0.1,
        );
      }
    }

    if (isPlausiblePrice(priceToApply, item.basePrice)) {
      o.price = priceToApply;
      o.landedCost = priceToApply;
      o.unitPrice = priceToApply;
      o.priceSource = "scraped";
      o.priceAsOf = new Date().toISOString();
      o.priceNote = priceNote;
      appendReason(o, "price.scraped", "price extracted from PDP", 0.18);
    }
  } else if (extraction.priceUsd && isPlausibleScrapedPrice(extraction.priceUsd)) {
    appendReason(
      o,
      "price.search-skipped",
      "price on search/list page not trusted",
      -0.08,
    );
  }

  if (extraction.storeTitle) {
    o.storeTitle = extraction.storeTitle;
  }

  if (o.retailer === "amazon") {
    const amazonMetrics = validateAmazonOffer(o, item, intentFromItem(item));
    logAmazonMatchDecision(item.id, amazonMetrics, "index");
    if (!amazonMetrics.accepted) {
      appendReason(
        o,
        amazonMetrics.rejectionReason ?? "amazon.rejected",
        amazonMetrics.matchReasons.join("; "),
        -0.35,
      );
      o.matchConfidence = Math.min(o.matchConfidence ?? 0.5, 0.35);
      if (o.priceSource === "scraped") {
        o.priceSource = "catalog_model";
        o.priceNote = "Amazon match rejected · verify manually";
      }
      return attachPipelineDebug(applyOfferQualityGates(o, item, intentFromItem(item)), {
        validationStatus: "rejected",
        rejectedReason: amazonMetrics.rejectionReason ?? "amazon_mismatch",
      });
    }
    appendReason(o, "amazon.match", amazonMetrics.matchReasons.join("; "), 0.15);
    o.matchConfidence = Math.min(
      1,
      Math.max(
        o.matchConfidence ?? 0.5,
        amazonMetrics.matchScore,
        MIN_TRUSTED_MATCH_CONFIDENCE,
      ),
    );
  }

  return applyOfferQualityGates(o, item, intentFromItem(item));
}

function intentFromItem(item: CatalogItem): ShoppingIntent {
  return {
    query: [item.brand, item.title].filter(Boolean).join(" "),
    category: item.category,
    zipCode: "78701",
  };
}

export function isTrustedOffer(offer: ProductOffer): boolean {
  return (offer.matchConfidence ?? 0) >= MIN_TRUSTED_MATCH_CONFIDENCE;
}
