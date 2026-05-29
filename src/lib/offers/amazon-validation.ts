import { titleSimilarity } from "../catalog/title-similarity";
import { scoreImageQuality } from "../identity/image-quality";
import { isGenericCatalogImage } from "../indexing/retailer-page-image";
import { isRetailerHostedImage } from "../indexing/retailer-page-image";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, ShoppingIntent } from "../types";
import type { RetailerSearchHit } from "./retailer-adapters/types";
import {
  normalizeAmazonListingPrice,
  amazonNormalizationEnabled,
  isBulkCommercialListing,
} from "./amazon-normalization";
import {
  isPlausiblePrice,
  isPlausibleScrapedPrice,
  MIN_TITLE_SIMILARITY,
  MIN_TRUSTED_MATCH_CONFIDENCE,
} from "./offer-quality";
import { isPdpProductUrl } from "./url-classifier";

function amazonPriceSanityOk(
  priceUsd: number | undefined,
  storeTitle: string,
  item: CatalogItem,
): { ok: boolean; normReason?: string } {
  if (!priceUsd) return { ok: true };
  if (!isPlausibleScrapedPrice(priceUsd)) return { ok: false, normReason: "invalid_price" };
  if (isPlausiblePrice(priceUsd, item.basePrice)) return { ok: true };
  if (isBulkCommercialListing(storeTitle, item)) {
    return { ok: false, normReason: "bulk_listing" };
  }
  if (amazonNormalizationEnabled()) {
    const norm = normalizeAmazonListingPrice(priceUsd, storeTitle, item);
    return { ok: norm.accepted, normReason: norm.reason };
  }
  return { ok: false, normReason: "catalog_drift" };
}

/** Minimum title overlap to accept an Amazon search hit without UPC match. */
export const AMAZON_MIN_TITLE_SIMILARITY = 0.38;

/** Minimum combined match score (title + price sanity) for Amazon PDP acceptance. */
export const AMAZON_MIN_MATCH_SCORE = 0.52;

export interface AmazonMatchMetrics {
  asin?: string;
  exactMatchConfidence: number;
  titleSimilarity: number;
  priceSanityOk: boolean;
  imageQualityOk: boolean;
  imageQualityScore: number;
  duplicatePdp: boolean;
  matchScore: number;
  accepted: boolean;
  rejectionReason?: string;
  /** Human-readable reasons WHY this match was chosen or rejected. */
  matchReasons: string[];
}

export function extractAmazonAsin(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.match(/\/dp\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase();
}

function catalogSearchTitle(item: CatalogItem, intent?: ShoppingIntent): string {
  const parts = [item.brand, item.title, intent?.query].filter(Boolean);
  return parts.join(" ").trim();
}

function variantMismatchSignals(
  catalogTitle: string,
  storeTitle: string | undefined,
  intent?: ShoppingIntent,
): string[] {
  const flags: string[] = [];
  const st = (storeTitle ?? "").toLowerCase();
  const ct = catalogTitle.toLowerCase();

  const sizeWords = ["xs", "small", "medium", "large", "xl", "xxl", "32", "34", "36"];
  for (const sz of sizeWords) {
    if (st.includes(sz) && !ct.includes(sz) && intent?.size) {
      flags.push(`size-mismatch:${sz}`);
    }
  }

  const colorWords = ["black", "white", "blue", "red", "green", "navy", "pink"];
  const intentColor = intent?.colors?.[0]?.toLowerCase();
  for (const c of colorWords) {
    if (st.includes(c) && intentColor && intentColor !== c && !ct.includes(c)) {
      flags.push(`color-mismatch:${c}`);
    }
  }

  return flags;
}

export function scoreAmazonSearchHit(
  hit: RetailerSearchHit,
  item: CatalogItem,
  intent?: ShoppingIntent,
  seenAsins: Set<string> = new Set(),
): AmazonMatchMetrics {
  const asin = hit.externalId ?? extractAmazonAsin(hit.pdpUrl);
  const catalogTitle = catalogSearchTitle(item, intent);
  const storeTitle = hit.storeTitle ?? "";
  const titleSim = titleSimilarity(catalogTitle, storeTitle);
  const duplicatePdp = Boolean(asin && seenAsins.has(asin));

  const priceCheck = amazonPriceSanityOk(hit.priceUsd, storeTitle, item);
  const priceSanityOk = priceCheck.ok;

  const imageQ = hit.imageUrl ? scoreImageQuality(hit.imageUrl) : { imageQualityScore: 0 };
  const imageUrl = hit.imageUrl ?? "";
  const imageQualityOk =
    imageUrl.startsWith("https://") &&
    !isGenericCatalogImage(imageUrl) &&
    isRetailerHostedImage(imageUrl, "amazon") &&
    imageQ.imageQualityScore >= 0.35;

  let exactMatchConfidence = titleSim;
  if (item.upc && hit.externalId) exactMatchConfidence = Math.max(exactMatchConfidence, 0.85);
  if ((item.brand ?? "").length > 2 && storeTitle.toLowerCase().includes(item.brand.toLowerCase())) {
    exactMatchConfidence += 0.08;
  }
  exactMatchConfidence = Math.min(1, exactMatchConfidence);

  const variantFlags = variantMismatchSignals(catalogTitle, storeTitle, intent);
  if (variantFlags.length) exactMatchConfidence *= 0.82;

  const matchScore =
    exactMatchConfidence * 0.55 +
    (priceSanityOk ? 0.25 : 0) +
    (imageQualityOk ? 0.12 : 0) +
    (hit.pdpUrl && isPdpProductUrl(hit.pdpUrl) ? 0.08 : 0);

  const matchReasons: string[] = [];
  if (asin) matchReasons.push(`asin=${asin}`);
  matchReasons.push(`titleSim=${titleSim.toFixed(2)}`);
  if (hit.priceUsd) matchReasons.push(`price=$${hit.priceUsd.toFixed(2)}`);
  if (priceSanityOk) matchReasons.push("price-sane");
  else matchReasons.push(`price-failed:${priceCheck.normReason ?? "sanity"}`);
  if (imageQualityOk) matchReasons.push(`imageQ=${imageQ.imageQualityScore.toFixed(2)}`);
  if (duplicatePdp) matchReasons.push("duplicate-asin");
  if (variantFlags.length) matchReasons.push(...variantFlags);

  let accepted = true;
  let rejectionReason: string | undefined;

  if (duplicatePdp) {
    accepted = false;
    rejectionReason = "amazon.duplicate_asin";
  } else if (titleSim < AMAZON_MIN_TITLE_SIMILARITY && !item.upc) {
    accepted = false;
    rejectionReason = "amazon.title_mismatch";
    matchReasons.push(`rejected:titleSim<${AMAZON_MIN_TITLE_SIMILARITY}`);
  } else if (hit.priceUsd && !priceSanityOk) {
    accepted = false;
    rejectionReason = "amazon.price_insane";
    matchReasons.push("rejected:price-sanity");
  } else if (matchScore < AMAZON_MIN_MATCH_SCORE) {
    accepted = false;
    rejectionReason = "amazon.low_match_score";
    matchReasons.push(`rejected:matchScore=${matchScore.toFixed(2)}`);
  } else if (variantFlags.length >= 2) {
    accepted = false;
    rejectionReason = "amazon.variant_mismatch";
    matchReasons.push("rejected:variant-mismatch");
  } else {
    matchReasons.push(`accepted:matchScore=${matchScore.toFixed(2)}`);
  }

  return {
    asin,
    exactMatchConfidence: Math.round(exactMatchConfidence * 1000) / 1000,
    titleSimilarity: Math.round(titleSim * 1000) / 1000,
    priceSanityOk,
    imageQualityOk,
    imageQualityScore: imageQ.imageQualityScore,
    duplicatePdp,
    matchScore: Math.round(matchScore * 1000) / 1000,
    accepted,
    rejectionReason,
    matchReasons,
  };
}

export function pickBestAmazonHitByCatalog(
  hits: RetailerSearchHit[],
  item: CatalogItem,
  intent?: ShoppingIntent,
  seenAsins: Set<string> = new Set(),
): { hit: RetailerSearchHit | null; metrics: AmazonMatchMetrics | null } {
  if (!hits.length) return { hit: null, metrics: null };

  let best: { hit: RetailerSearchHit; metrics: AmazonMatchMetrics } | null = null;
  for (const hit of hits) {
    const metrics = scoreAmazonSearchHit(hit, item, intent, seenAsins);
    if (!metrics.accepted) continue;
    if (!best || metrics.matchScore > best.metrics.matchScore) {
      best = { hit, metrics };
    }
  }

  if (best) return best;

  const fallback = scoreAmazonSearchHit(hits[0]!, item, intent, seenAsins);
  return { hit: null, metrics: fallback };
}

export function validateAmazonOffer(
  offer: ProductOffer,
  item: CatalogItem,
  intent?: ShoppingIntent,
  seenAsins: Set<string> = new Set(),
): AmazonMatchMetrics {
  const asin = extractAmazonAsin(offer.productUrl);
  const hit: RetailerSearchHit = {
    pdpUrl: offer.productUrl,
    priceUsd: offer.price > 0 ? offer.price : undefined,
    storeTitle: offer.storeTitle ?? offer.title,
    imageUrl: offer.imageUrl,
    externalId: asin,
    fromSearchParser: offer.priceSource === "scraped",
  };
  const metrics = scoreAmazonSearchHit(hit, item, intent, seenAsins);

  if (metrics.accepted && (offer.matchConfidence ?? 0) < MIN_TRUSTED_MATCH_CONFIDENCE) {
    return {
      ...metrics,
      accepted: false,
      rejectionReason: "amazon.low_confidence",
      matchReasons: [...metrics.matchReasons, "rejected:offer-confidence-low"],
    };
  }

  return metrics;
}

export function logAmazonMatchDecision(
  catalogId: string,
  metrics: AmazonMatchMetrics,
  context: "search" | "index" | "persist" = "index",
): void {
  const level =
    process.env.PIPELINE_DEBUG === "1" ||
    process.env.INDEX_OFFER_DIAGNOSTICS === "1" ||
    process.env.AMAZON_MATCH_LOG === "1";
  if (!level) return;

  console.log(`[amazon-match:${context}]`, catalogId, {
    asin: metrics.asin,
    accepted: metrics.accepted,
    matchScore: metrics.matchScore,
    titleSim: metrics.titleSimilarity,
    priceSanityOk: metrics.priceSanityOk,
    imageQualityOk: metrics.imageQualityOk,
    duplicatePdp: metrics.duplicatePdp,
    rejectionReason: metrics.rejectionReason,
    why: metrics.matchReasons.join(" · "),
  });
}
