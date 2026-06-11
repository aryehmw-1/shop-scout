// Confidence Scoring — 0–100, with hard rejects that override all positives.
// Translates the matched signals between two listings into a number that the
// state machine maps to VERIFIED / approved / needs_review / rejected.

import { gtinEquivalent, titleSimilarity } from "./normalize";
import { criticalDifferences, sizeMatters, variantMatters } from "./category-rules";
import { packMatches, sizeMatches } from "./match";
import type { NormalizedListing, ScoreResult } from "./types";

/**
 * Score how confidently two listings are the same product. When `b` is omitted
 * the score reflects single-listing completeness (price/image/availability) for
 * a standalone publish decision.
 */
export function scoreMatch(a: NormalizedListing, b?: NormalizedListing): ScoreResult {
  const reasons: string[] = [];
  let score = 0;

  // ── Pairwise signals ──
  if (b) {
    const critical = criticalDifferences(a, b);
    if (critical.length) {
      return { score: 0, reasons: critical.map((c) => `reject:${c}`), hardReject: true };
    }

    const kind = a.categoryKind === b.categoryKind ? a.categoryKind : "general";

    const aCodes = [a.upc, a.gtin, a.ean].filter(Boolean) as string[];
    const bCodes = [b.upc, b.gtin, b.ean].filter(Boolean) as string[];
    const barcodeMatch = aCodes.some((x) => bCodes.some((y) => gtinEquivalent(x, y)));
    if (barcodeMatch) {
      score += 55;
      reasons.push("+55 barcode_exact");
    }

    if (a.modelNumberNormalized && a.modelNumberNormalized === b.modelNumberNormalized) {
      score += 35;
      reasons.push("+35 model_exact");
    }

    if (a.brandNormalized && a.brandNormalized === b.brandNormalized) {
      score += 15;
      reasons.push("+15 brand_match");
    }

    if (a.sizeValue !== undefined && b.sizeValue !== undefined && sizeMatches(a, b)) {
      score += 15;
      reasons.push("+15 size_match");
    } else if ((a.sizeValue === undefined || b.sizeValue === undefined) && sizeMatters(kind)) {
      score -= 15;
      reasons.push("-15 size_missing_grocery");
    }

    if (packMatches(a, b) && (a.packCount !== undefined || b.packCount !== undefined)) {
      score += 10;
      reasons.push("+10 pack_match");
    }

    if (variantMatters(kind) && a.colorNormalized && a.colorNormalized === b.colorNormalized) {
      score += 10;
      reasons.push("+10 color_match");
    }

    const sim = titleSimilarity(a.titleNormalized, b.titleNormalized);
    if (sim >= 0.85) {
      score += 10;
      reasons.push(`+10 title_sim=${sim.toFixed(2)}`);
    } else if (sim >= 0.5) {
      reasons.push(`~ title_sim=${sim.toFixed(2)}`);
    }
  }

  // ── Single-listing completeness (apply to the candidate `a`) ──
  if (a.price !== undefined && a.price > 0) {
    score += 5;
    reasons.push("+5 price_present");
  } else {
    score -= 20;
    reasons.push("-20 price_missing");
  }

  if (a.imageUrl) {
    score += 8;
    reasons.push("+8 image_present");
  } else {
    score -= 10;
    reasons.push("-10 image_missing");
  }

  if (a.availability) {
    score += 3;
    reasons.push("+3 availability_present");
  }

  return { score: clamp(score), reasons, hardReject: false };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
