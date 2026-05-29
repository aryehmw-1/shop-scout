/**
 * Deep diagnostics for Amazon offer persist failures.
 */

import { titleSimilarity } from "../catalog/title-similarity";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, ShoppingIntent } from "../types";
import {
  normalizeAmazonListingPrice,
  extractPackCount,
  isBulkCommercialListing,
} from "../offers/amazon-normalization";
import {
  validateAmazonOffer,
  extractAmazonAsin,
  type AmazonMatchMetrics,
} from "../offers/amazon-validation";
import {
  passesConsumerTrustGates,
  passesImageTrustGate,
  passesIdentifierAlignment,
  passesRetailerLinkGate,
  isQuoteFreshForDisplay,
  MIN_CONSUMER_MATCH_CONFIDENCE,
} from "../offers/consumer-trust";
import {
  isPlausiblePrice,
  isPlausibleScrapedPrice,
  MIN_TRUSTED_MATCH_CONFIDENCE,
} from "../offers/offer-quality";
import {
  validateOfferBeforePersist,
  type PersistValidationResult,
} from "../offers/offer-persist-validation";
import { isVerifiedOffer } from "../offers/offer-trust";
import { isPdpProductUrl } from "../offers/url-classifier";

export interface AmazonPersistDiagnostic {
  catalogId: string;
  retailer: string;
  storeTitle?: string;
  asin?: string;
  rawPrice?: number;
  appliedPrice?: number;
  priceSource?: string;
  productUrl?: string;
  normalization: ReturnType<typeof normalizeAmazonListingPrice> | null;
  packCount: number;
  isBulk: boolean;
  plausibility: {
    rawVsCatalog: boolean;
    appliedVsCatalog: boolean;
    catalogBase: number;
    rawRatio: number | null;
    appliedRatio: number | null;
  };
  amazonValidation: AmazonMatchMetrics;
  titleSimilarity: number;
  matchConfidence: number;
  identityConfidence?: number;
  imageConfidence?: number;
  persistValidation: PersistValidationResult;
  persistRejectionReason?: string;
  trustGates: {
    verifiedOffer: boolean;
    consumerTrust: boolean;
    imageGate: boolean;
    identifierGate: boolean;
    linkGate: boolean;
    freshGate: boolean;
    consumerMinConfidence: number;
    persistMinConfidence: number;
  };
  confidenceReasons: string[];
  likelyRootCause: string;
}

export function diagnoseAmazonOfferPersist(
  offer: ProductOffer,
  item: CatalogItem,
  intent?: ShoppingIntent,
  rawScrapedPrice?: number,
): AmazonPersistDiagnostic {
  const storeTitle = offer.storeTitle ?? offer.title;
  const rawPrice = rawScrapedPrice ?? offer.price;
  const norm =
    rawPrice && isPlausibleScrapedPrice(rawPrice) ?
      normalizeAmazonListingPrice(rawPrice, storeTitle, item)
    : null;

  const appliedPrice = offer.price;
  const catalogBase = item.basePrice;
  const rawRatio = rawPrice && catalogBase > 0 ? rawPrice / catalogBase : null;
  const appliedRatio =
    appliedPrice && catalogBase > 0 ? appliedPrice / catalogBase : null;

  const amazonValidation = validateAmazonOffer(offer, item, intent);
  const persistValidation = validateOfferBeforePersist(offer, item, intent);
  const titleSim = titleSimilarity(
    [item.brand, item.title].filter(Boolean).join(" "),
    storeTitle,
  );

  const trustGates = {
    verifiedOffer: isVerifiedOffer(offer),
    consumerTrust: passesConsumerTrustGates(offer),
    imageGate: passesImageTrustGate(offer),
    identifierGate: passesIdentifierAlignment(offer),
    linkGate: passesRetailerLinkGate(offer),
    freshGate: isQuoteFreshForDisplay(offer),
    consumerMinConfidence: MIN_CONSUMER_MATCH_CONFIDENCE,
    persistMinConfidence: MIN_TRUSTED_MATCH_CONFIDENCE,
  };

  const reasons = (offer.confidenceReasons ?? []).map(
    (r) => `${r.code}: ${r.message}`,
  );

  const likelyRootCause = inferRootCause(
    offer,
    persistValidation,
    norm,
    trustGates,
    amazonValidation,
  );

  return {
    catalogId: item.id,
    retailer: offer.retailer,
    storeTitle,
    asin: extractAmazonAsin(offer.productUrl),
    rawPrice,
    appliedPrice,
    priceSource: offer.priceSource,
    productUrl: offer.productUrl?.slice(0, 100),
    normalization: norm,
    packCount: extractPackCount(storeTitle, item.size),
    isBulk: isBulkCommercialListing(storeTitle, item),
    plausibility: {
      rawVsCatalog: rawPrice ? isPlausiblePrice(rawPrice, catalogBase) : false,
      appliedVsCatalog:
        appliedPrice ? isPlausiblePrice(appliedPrice, catalogBase) : false,
      catalogBase,
      rawRatio: rawRatio ? Math.round(rawRatio * 100) / 100 : null,
      appliedRatio: appliedRatio ? Math.round(appliedRatio * 100) / 100 : null,
    },
    amazonValidation,
    titleSimilarity: Math.round(titleSim * 1000) / 1000,
    matchConfidence: offer.matchConfidence ?? 0,
    identityConfidence: offer.identityConfidence,
    imageConfidence: offer.imageConfidence,
    persistValidation,
    persistRejectionReason: persistValidation.ok ?
      undefined
    : `${persistValidation.reason}${persistValidation.detail ? `: ${persistValidation.detail}` : ""}`,
    trustGates,
    confidenceReasons: reasons,
    likelyRootCause,
  };
}

function inferRootCause(
  offer: ProductOffer,
  persist: PersistValidationResult,
  norm: ReturnType<typeof normalizeAmazonListingPrice> | null,
  trust: AmazonPersistDiagnostic["trustGates"],
  amazon: AmazonMatchMetrics,
): string {
  if (persist.ok) return "would_persist";

  if (offer.priceSource !== "scraped" && offer.priceSource !== "connector_api") {
    const reasons = offer.confidenceReasons ?? [];
    if (reasons.some((r) => r.code === "amazon.rejected" || r.code === "amazon.low_confidence")) {
      return "amazon_validation_rejected_during_extraction_stale_catalog_confidence";
    }
    if (norm && !norm.accepted) {
      return `normalization_rejected: ${norm.reason}`;
    }
    if (norm?.accepted) {
      return "normalization_ok_but_price_not_applied_to_offer";
    }
    return `non_persistable_source: ${offer.priceSource ?? "catalog_model"}`;
  }

  if (persist.reason === "low_confidence") {
    if ((offer.matchConfidence ?? 0) < MIN_TRUSTED_MATCH_CONFIDENCE) {
      const weakTitle = (offer.confidenceReasons ?? []).some((r) => r.code === "title.weak");
      if (weakTitle) {
        return "title_weak_penalty_crushed_confidence_below_persist_floor";
      }
      return "match_confidence_crushed_below_persist_floor_after_enrichment_rescore";
    }
  }

  if (persist.reason === "amazon_mismatch") {
    return `amazon_validation: ${amazon.rejectionReason ?? "rejected"}`;
  }

  if (persist.reason === "category_price_mismatch") {
    return `price_plausibility_failed_after_normalization: ${persist.detail}`;
  }

  if (persist.reason === "placeholder_image") {
    return "missing_or_placeholder_image";
  }

  if (!trust.linkGate) {
    return "invalid_pdp_url";
  }

  return persist.reason ?? "unknown";
}

export function formatAmazonPersistDiagnostic(d: AmazonPersistDiagnostic): string {
  const lines = [
    `### ${d.catalogId} · ${d.retailer}`,
    `- **Root cause:** ${d.likelyRootCause}`,
    `- **Persist rejection:** ${d.persistRejectionReason ?? "PASS"}`,
    `- **Price:** raw=$${d.rawPrice?.toFixed(2) ?? "?"} → applied=$${d.appliedPrice?.toFixed(2) ?? "?"} (${d.priceSource})`,
    `- **Plausibility:** raw ratio=${d.plausibility.rawRatio ?? "?"} applied ratio=${d.plausibility.appliedRatio ?? "?"} (catalog $${d.plausibility.catalogBase})`,
    `- **Normalization:** ${d.normalization ? `${d.normalization.method} accepted=${d.normalization.accepted} reason=${d.normalization.reason} pack=${d.normalization.packCount} normalized=$${d.normalization.normalizedPrice}` : "n/a"}`,
    `- **Bulk listing:** ${d.isBulk}`,
    `- **Amazon validation:** accepted=${d.amazonValidation.accepted} score=${d.amazonValidation.matchScore} reason=${d.amazonValidation.rejectionReason ?? "ok"}`,
    `- **Confidence:** match=${d.matchConfidence.toFixed(3)} identity=${d.identityConfidence?.toFixed(3) ?? "?"} image=${d.imageConfidence?.toFixed(3) ?? "?"} titleSim=${d.titleSimilarity}`,
    `- **Trust gates:** verified=${d.trustGates.verifiedOffer} consumer=${d.trustGates.consumerTrust} image=${d.trustGates.imageGate} identifier=${d.trustGates.identifierGate}`,
    `- **ASIN:** ${d.asin ?? "?"} · PDP: ${d.productUrl ?? "?"}`,
  ];
  if (d.confidenceReasons.length) {
    lines.push(`- **Reasons:** ${d.confidenceReasons.slice(0, 5).join(" | ")}`);
  }
  return lines.join("\n");
}
