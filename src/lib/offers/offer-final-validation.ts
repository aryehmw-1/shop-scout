import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, RetailerId, ShoppingIntent } from "../types";
import type { RetailerEnrichmentAttempt } from "./enrichment-report";
import { attachPipelineDebug } from "./offer-pipeline-meta";
import { PROXY_SENSITIVE_RETAILERS } from "./retailer-enrichment-status";
import { hasRetailerAdapter } from "./retailer-enrichment-status";
import { isDisplayableOffer, validateOfferBeforePersist } from "./offer-persist-validation";
import { isVerifiedOffer } from "./offer-trust";
import { recordPersistOutcome } from "../indexing/index-retailer-summary";
import { indexLog } from "../indexing/index-progress";

/**
 * Mark adapter-retailer offers as rejected when fetch/parse failed.
 * Prevents catalog fallbacks from appearing as broken partial rows.
 */
export function applyGracefulRetailerDegradation(
  offers: ProductOffer[],
  attempts: RetailerEnrichmentAttempt[],
): ProductOffer[] {
  const attemptByRetailer = new Map(attempts.map((a) => [a.retailer, a]));

  return offers.map((offer) => {
    const attempt = attemptByRetailer.get(offer.retailer);
    if (!attempt) return offer;

    if (
      attempt.status === "blocked" ||
      attempt.status === "parser_missing" ||
      attempt.status === "no_match"
    ) {
      if (!hasRetailerAdapter(offer.retailer) && !PROXY_SENSITIVE_RETAILERS.has(offer.retailer)) {
        return offer;
      }
      return attachPipelineDebug(
        {
          ...offer,
          matchConfidence: Math.min(offer.matchConfidence ?? 0.5, 0.25),
        },
        {
          validationStatus: "rejected",
          rejectedReason: attempt.rejectionReason ?? attempt.status,
          retailerStatus: attempt.status,
        } as Partial<import("./offer-pipeline-meta").OfferPipelineDebug>,
      );
    }

    if (attempt.status === "low_confidence") {
      return attachPipelineDebug(offer, {
        validationStatus: "rejected",
        rejectedReason: "low_confidence",
        retailerStatus: "low_confidence",
      } as Partial<import("./offer-pipeline-meta").OfferPipelineDebug>);
    }

    return attachPipelineDebug(offer, {
      validationStatus: isVerifiedOffer(offer) ? "ok" : "skipped",
      retailerStatus: attempt.status,
    } as Partial<import("./offer-pipeline-meta").OfferPipelineDebug>);
  });
}

/** Run persist + display validation; attach rejection metadata. */
export function applyFinalOfferValidation(
  offers: ProductOffer[],
  item: CatalogItem,
  intent: ShoppingIntent,
  attempts: RetailerEnrichmentAttempt[] = [],
): {
  offers: ProductOffer[];
  persistable: ProductOffer[];
  displayable: ProductOffer[];
  persistRejected: Array<{ offer: ProductOffer; reason: string; detail?: string }>;
} {
  const degraded = applyGracefulRetailerDegradation(offers, attempts);
  const attemptByRetailer = new Map(attempts.map((a) => [a.retailer, a]));
  const seenImages = new Set<string>();
  const seenAsins = new Set<string>();
  const persistable: ProductOffer[] = [];
  const displayable: ProductOffer[] = [];
  const persistRejected: Array<{ offer: ProductOffer; reason: string; detail?: string }> = [];

  const patched = degraded.map((offer) => {
    const attempt = attemptByRetailer.get(offer.retailer);
    const result = validateOfferBeforePersist(offer, item, intent, {
      seenImages,
      seenAsins,
      retailerStatus: attempt?.status,
    });

    if (result.ok) {
      persistable.push(offer);
      recordPersistOutcome(offer.retailer, true);
      if (offer.imageUrl) seenImages.add(offer.imageUrl);
      const asin = offer.productUrl.match(/\/dp\/([A-Z0-9]{10})/i)?.[1];
      if (asin) seenAsins.add(asin.toUpperCase());
      const next = attachPipelineDebug(offer, {
        validationStatus: "ok",
        retailerStatus: "success",
      } as Partial<import("./offer-pipeline-meta").OfferPipelineDebug>);
      if (isDisplayableOffer(next)) displayable.push(next);
      return next;
    }

    persistRejected.push({
      offer,
      reason: result.reason ?? "unknown",
      detail: result.detail,
    });
    recordPersistOutcome(offer.retailer, false, result.reason ?? "unknown");
    indexLog("persist: rejected", {
      retailer: offer.retailer,
      reason: result.reason,
      detail: result.detail?.slice(0, 80),
    });

    return attachPipelineDebug(offer, {
      validationStatus: "rejected",
      rejectedReason: result.reason,
      persistRejected: true,
      persistRejectionReason: result.detail ?? result.reason,
      retailerStatus: result.retailerStatus ?? attempt?.status,
    } as Partial<import("./offer-pipeline-meta").OfferPipelineDebug>);
  });

  return { offers: patched, persistable, displayable, persistRejected };
}

/** Strip non-displayable offers from search results for API responses. */
export function filterResultsForTrustedDisplay(
  results: import("../types").ProductSearchResults,
  displayableIds: Set<string>,
): import("../types").ProductSearchResults {
  return {
    ...results,
    online: results.online.filter((o) => displayableIds.has(o.id)),
    local: results.local.filter((o) => displayableIds.has(o.id)),
    estimatedOnline: [],
  };
}

export function retailerIdsFromAttempts(attempts: RetailerEnrichmentAttempt[]): RetailerId[] {
  return attempts.map((a) => a.retailer);
}
