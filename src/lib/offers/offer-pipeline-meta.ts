import type { ProductOffer } from "../types";
import { isVerifiedOffer } from "./offer-trust";
import { consumerVerificationAgeLabel } from "../shopping/consumer-copy";

export type PriceBadgeKind =
  | "verified_live"
  | "estimated"
  | "unavailable";

export type ImageFallbackLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface OfferPipelineDebug {
  priceBadge: PriceBadgeKind;
  scrapeAgeMinutes?: number;
  source: string;
  extractionMethod?: string;
  scrapeTimestamp?: string;
  cacheHit?: boolean;
  validationStatus: "ok" | "rejected" | "skipped" | "pending";
  rejectedReason?: string;
  imageFallbackLevel: ImageFallbackLevel;
  imageExtractionMethod?: string;
  imageUrlResolved?: string;
  imageNormalized?: boolean;
  /** Internal retailer scrape outcome — debug only. */
  retailerStatus?: import("./retailer-enrichment-status").RetailerEnrichmentStatus;
  amazonMatchScore?: number;
  persistRejected?: boolean;
  persistRejectionReason?: string;
  urlValidation?: {
    ok: boolean;
    httpStatus?: number;
    finalUrl?: string;
    reason?: string;
  };
}

export function attachPipelineDebug(
  offer: ProductOffer,
  patch: Partial<OfferPipelineDebug>,
): ProductOffer {
  const prev = offer.pipelineDebug;
  return {
    ...offer,
    pipelineDebug: {
      priceBadge: prev?.priceBadge ?? "estimated",
      source: offer.priceSource ?? "catalog_model",
      validationStatus: prev?.validationStatus ?? "pending",
      imageFallbackLevel: prev?.imageFallbackLevel ?? 5,
      ...prev,
      ...patch,
    },
  };
}

export function scrapeAgeMinutes(offer: ProductOffer): number | undefined {
  const ts = offer.pipelineDebug?.scrapeTimestamp ?? offer.priceAsOf;
  if (!ts) return undefined;
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return Math.round(ms / 60_000);
}

export function formatScrapeAgeLabel(offer: ProductOffer): string | null {
  const mins = scrapeAgeMinutes(offer);
  return consumerVerificationAgeLabel(mins);
}

export function syncPriceBadge(offer: ProductOffer): ProductOffer {
  let priceBadge: PriceBadgeKind = "estimated";
  if (isVerifiedOffer(offer)) {
    priceBadge = "verified_live";
  } else if (
    offer.pipelineDebug?.rejectedReason ||
    (offer.priceSource === "scraped" && offer.price <= 0) ||
    offer.pipelineDebug?.validationStatus === "rejected"
  ) {
    priceBadge = "unavailable";
  }
  return attachPipelineDebug(offer, {
    priceBadge,
    source: offer.priceSource ?? "catalog_model",
    scrapeTimestamp: offer.priceAsOf ?? offer.pipelineDebug?.scrapeTimestamp,
  });
}
