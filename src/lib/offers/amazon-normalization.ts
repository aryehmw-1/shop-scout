/**
 * Amazon listing normalization — pack-size, quantity, and bulk/commercial suppression.
 * Resolves bulk/multi-pack prices that fail naive catalog basePrice comparison.
 */

import type { CatalogItem } from "../retailers/catalog";
import { isPlausiblePrice, isPlausibleScrapedPrice } from "./offer-quality";

export interface AmazonPriceNormalization {
  rawPrice: number;
  normalizedPrice: number;
  packCount: number;
  weightRatio: number | null;
  isBulkListing: boolean;
  accepted: boolean;
  reason: string;
  method: "direct" | "pack-count" | "weight-ratio" | "inferred-pack" | "rejected";
}

const BULK_TITLE =
  /\b(case of|food service|restaurant|commercial|institutional|bulk pack|value pack|party size|family size|club pack|wholesale)\b/i;

const PACK_PATTERNS: RegExp[] = [
  /\b(?:pack of|set of|bundle of)\s*(\d{1,2})\b/i,
  /\b(\d{1,2})\s*-?\s*(?:count|ct|pk|pack|packs)\b/i,
  /\((\d{1,2})\s*(?:count|ct|pk|pack)\)/i,
  /\b(\d{1,2})\s*x\s*\d+/i,
];

function parseWeightLb(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound)\b/i);
  if (!m?.[1]) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseWeightOz(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz\b/i);
  if (!m?.[1]) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function extractPackCount(storeTitle: string, catalogSize?: string): number {
  const title = storeTitle.toLowerCase();
  for (const re of PACK_PATTERNS) {
    const m = title.match(re);
    if (m?.[1]) {
      const n = parseInt(m[1], 10);
      if (n >= 2 && n <= 48) return n;
    }
  }

  const catalogPack = catalogSize?.match(/(\d+)\s*ct/i);
  if (catalogPack?.[1]) {
    const n = parseInt(catalogPack[1], 10);
    if (n >= 2 && n <= 48) return n;
  }

  return 1;
}

export function isBulkCommercialListing(storeTitle: string, catalogItem: CatalogItem): boolean {
  const title = storeTitle.toLowerCase();
  if (BULK_TITLE.test(title)) return true;

  const catalogLb = parseWeightLb(catalogItem.size);
  const titleLb = parseWeightLb(storeTitle);
  if (catalogLb && titleLb && titleLb > catalogLb * 2.5) return true;

  const catalogOz = parseWeightOz(catalogItem.size);
  const titleOz = parseWeightOz(storeTitle);
  if (catalogOz && titleOz && titleOz > catalogOz * 3) return true;

  if (/\b(\d{2,3})\s*(?:lb|lbs)\b/i.test(storeTitle) && catalogLb && catalogLb <= 5) {
    return true;
  }

  return false;
}

export function normalizeAmazonListingPrice(
  rawPrice: number,
  storeTitle: string,
  item: CatalogItem,
): AmazonPriceNormalization {
  const base: AmazonPriceNormalization = {
    rawPrice,
    normalizedPrice: rawPrice,
    packCount: 1,
    weightRatio: null,
    isBulkListing: false,
    accepted: false,
    reason: "pending",
    method: "rejected",
  };

  if (!isPlausibleScrapedPrice(rawPrice)) {
    return { ...base, reason: "invalid_raw_price", method: "rejected" };
  }

  if (isBulkCommercialListing(storeTitle, item)) {
    return {
      ...base,
      isBulkListing: true,
      reason: "bulk_or_commercial_listing",
      method: "rejected",
    };
  }

  if (isPlausiblePrice(rawPrice, item.basePrice)) {
    return {
      ...base,
      normalizedPrice: rawPrice,
      accepted: true,
      reason: "direct_catalog_match",
      method: "direct",
    };
  }

  const packCount = extractPackCount(storeTitle, item.size);
  if (packCount > 1) {
    const perUnit = rawPrice / packCount;
    if (isPlausiblePrice(perUnit, item.basePrice)) {
      return {
        ...base,
        packCount,
        normalizedPrice: Math.round(perUnit * 100) / 100,
        accepted: true,
        reason: `pack_normalized_${packCount}x`,
        method: "pack-count",
      };
    }
  }

  const catalogLb = parseWeightLb(item.size);
  const titleLb = parseWeightLb(storeTitle);
  if (catalogLb && titleLb && titleLb > 0 && catalogLb > 0 && titleLb !== catalogLb) {
    const ratio = catalogLb / titleLb;
    const perCatalogUnit = rawPrice * ratio;
    if (isPlausiblePrice(perCatalogUnit, item.basePrice)) {
      return {
        ...base,
        weightRatio: ratio,
        normalizedPrice: Math.round(perCatalogUnit * 100) / 100,
        accepted: true,
        reason: `weight_ratio_${titleLb}lb_to_${catalogLb}lb`,
        method: "weight-ratio",
      };
    }
  }

  const inferredPack = Math.round(rawPrice / item.basePrice);
  const titleHasPackEvidence = PACK_PATTERNS.some((re) => re.test(storeTitle.toLowerCase()));
  if (inferredPack >= 2 && inferredPack <= 24) {
    if (inferredPack > 6 && !titleHasPackEvidence) {
      return {
        ...base,
        packCount: inferredPack,
        reason: "inferred_bulk_without_pack_evidence",
        method: "rejected",
      };
    }
    const perUnit = rawPrice / inferredPack;
    if (isPlausiblePrice(perUnit, item.basePrice)) {
      return {
        ...base,
        packCount: inferredPack,
        normalizedPrice: Math.round(perUnit * 100) / 100,
        accepted: true,
        reason: `inferred_pack_${inferredPack}x`,
        method: "inferred-pack",
      };
    }
  }

  return {
    ...base,
    packCount,
    reason: "price_not_plausible_after_normalization",
    method: "rejected",
  };
}

export function amazonNormalizationEnabled(): boolean {
  const raw = process.env.INDEX_AMAZON_NORMALIZE?.trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return false;
  return true;
}
