// Product Matching Engine — do two listings represent the EXACT same
// purchasable product? Conservative by design: it is far better to leave two
// listings unmatched than to merge a 46 oz with a 92 oz.
//
// Tier priority:
//   1. UPC / GTIN / EAN exact match
//   2. Exact model-number match
//   3. Brand + normalized title + exact size/quantity match
//   4. Image similarity            (signal only — never sole basis here)
//   5. AI-assisted                 (handled separately in ai-validate.ts)
//
// Critical differences are HARD: if present, the listings are NOT a match no
// matter what other signals say. Variants must never be merged incorrectly.

import { gtinEquivalent, titleSimilarity } from "./normalize";
import { criticalDifferences } from "./category-rules";
import type { MatchResult, NormalizedListing } from "./types";

const TITLE_MATCH_THRESHOLD = 0.85;

/**
 * Compare a candidate listing against a reference (e.g. an existing catalog
 * product). Returns the best tier at which they match, or none.
 */
export function matchListings(a: NormalizedListing, b: NormalizedListing): MatchResult {
  // Hard conflicts first — these block a match at every tier.
  const critical = criticalDifferences(a, b);
  if (critical.length) {
    return { isMatch: false, tier: "none", criticalDifferences: critical, reasons: ["critical_difference"] };
  }

  // Tier 1 — barcode identity (most authoritative).
  const aCodes = [a.upc, a.gtin, a.ean].filter(Boolean) as string[];
  const bCodes = [b.upc, b.gtin, b.ean].filter(Boolean) as string[];
  for (const x of aCodes) {
    for (const y of bCodes) {
      if (gtinEquivalent(x, y)) {
        return { isMatch: true, tier: "upc_gtin_ean", criticalDifferences: [], reasons: ["barcode_exact"] };
      }
    }
  }

  // Tier 2 — exact model number.
  if (
    a.modelNumberNormalized &&
    b.modelNumberNormalized &&
    a.modelNumberNormalized === b.modelNumberNormalized
  ) {
    return { isMatch: true, tier: "model_number", criticalDifferences: [], reasons: ["model_exact"] };
  }

  // Tier 3 — brand + title + exact size/quantity.
  const brandOk =
    !!a.brandNormalized && !!b.brandNormalized && a.brandNormalized === b.brandNormalized;
  const titleSim = titleSimilarity(a.titleNormalized, b.titleNormalized);
  const sizeOk = sizeMatches(a, b);
  const packOk = packMatches(a, b);
  if (brandOk && titleSim >= TITLE_MATCH_THRESHOLD && sizeOk && packOk) {
    return {
      isMatch: true,
      tier: "brand_title_size",
      criticalDifferences: [],
      reasons: [`brand_title_size title_sim=${titleSim.toFixed(2)}`],
    };
  }

  // No confident structured match. Image/AI tiers are decided by the caller
  // (image similarity is a weak signal; AI is a supplement, never sole truth).
  const reasons: string[] = [];
  if (!brandOk) reasons.push("brand_differs_or_missing");
  if (titleSim < TITLE_MATCH_THRESHOLD) reasons.push(`title_sim_low=${titleSim.toFixed(2)}`);
  if (!sizeOk) reasons.push("size_unconfirmed");
  if (!packOk) reasons.push("pack_unconfirmed");
  return { isMatch: false, tier: "none", criticalDifferences: [], reasons };
}

/** Sizes match when both are known and equal, OR neither side specifies one. */
export function sizeMatches(a: NormalizedListing, b: NormalizedListing): boolean {
  if (a.sizeValue === undefined && b.sizeValue === undefined) return true;
  if (a.sizeValue === undefined || b.sizeValue === undefined) return false;
  return a.sizeUnit === b.sizeUnit && Math.abs(a.sizeValue - b.sizeValue) < 1e-6;
}

/** Pack counts match when both equal, OR neither side declares a multipack. */
export function packMatches(a: NormalizedListing, b: NormalizedListing): boolean {
  if (a.packCount === undefined && b.packCount === undefined) return true;
  if (a.packCount === undefined || b.packCount === undefined) return false;
  return a.packCount === b.packCount;
}

/** Whether structured fields are too sparse to match without AI assistance. */
export function needsAiAssist(a: NormalizedListing, b: NormalizedListing): boolean {
  const noCodes = ![a.upc, a.gtin, a.ean].some(Boolean) || ![b.upc, b.gtin, b.ean].some(Boolean);
  const noModel = !a.modelNumberNormalized || !b.modelNumberNormalized;
  const sim = titleSimilarity(a.titleNormalized, b.titleNormalized);
  const mediumTitle = sim >= 0.5 && sim < TITLE_MATCH_THRESHOLD;
  return noCodes && noModel && mediumTitle;
}
