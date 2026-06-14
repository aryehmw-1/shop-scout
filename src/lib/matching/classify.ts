// Reusable product-pair classifier: EXACT_MATCH | SIMILAR_ALTERNATIVE | DIFFERENT
// with a confidence score and the method that decided it.
//
// Decision order (per product spec):
//   1. Deterministic exact identifiers FIRST — shared barcode (UPC/GTIN/EAN) or
//      same brand + model number → EXACT_MATCH, highest confidence.
//   2. Structured attribute/title scoring (reuses score.ts / match.ts) for
//      EXACT (same category + very high similarity) vs SIMILAR (same
//      category/function + key attributes, brand may differ) vs DIFFERENT.
//   3. (Phase 2) embedding similarity for candidate scoring, then an LLM judge
//      ONLY for the uncertain band — layered on top of this module, never the
//      sole source of truth.
//
// Guardrail: a pair is NEVER returned as EXACT_MATCH below EXACT_MIN_CONFIDENCE.

import { scoreMatch } from "../pipeline/score";
import { matchListings } from "../pipeline/match";
import { baseTokens } from "../search/query-understanding";
import type { NormalizedListing } from "../pipeline/types";

export type MatchDecision = "EXACT_MATCH" | "SIMILAR_ALTERNATIVE" | "DIFFERENT";
export type MatchMethod = "deterministic" | "embedding" | "llm";

export interface MatchResult {
  decision: MatchDecision;
  /** 0–1. Calibrated so EXACT is only emitted at/above EXACT_MIN_CONFIDENCE. */
  confidence: number;
  method: MatchMethod;
  reasons: string[];
}

/** A pair below this confidence is never shown as EXACT (downgraded to SIMILAR). */
export const EXACT_MIN_CONFIDENCE = 0.85;
/** Below this, a pair isn't even a SIMILAR alternative — it's DIFFERENT.
 *  ~1/3 shared content tokens is enough to be a same-function alternative. */
export const SIMILAR_MIN_CONFIDENCE = 0.34;

function normCode(v?: string | null): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Do two listings share a real barcode (GTIN-14 normalized)? */
function sharedBarcode(a: NormalizedListing, b: NormalizedListing): boolean {
  const codesA = [a.upc, a.gtin, a.ean].map(normCode).filter((c) => c.length >= 8);
  const codesB = [b.upc, b.gtin, b.ean].map(normCode).filter((c) => c.length >= 8);
  if (!codesA.length || !codesB.length) return false;
  const setB = new Set(codesB.map((c) => c.slice(-14).padStart(14, "0")));
  return codesA.some((c) => setB.has(c.slice(-14).padStart(14, "0")));
}

function sameBrandModel(a: NormalizedListing, b: NormalizedListing): boolean {
  return Boolean(
    a.brandNormalized &&
      a.brandNormalized === b.brandNormalized &&
      a.modelNumberNormalized &&
      a.modelNumberNormalized === b.modelNumberNormalized,
  );
}

function sameCategory(a: NormalizedListing, b: NormalizedListing): boolean {
  if (a.categoryKind && b.categoryKind && a.categoryKind === b.categoryKind) return true;
  if (a.category && b.category) return a.category === b.category;
  return false;
}

/** Jaccard overlap of content tokens between two titles (+brands). 0–1. Drives
 *  the SIMILAR tier — two related products share product nouns even when the
 *  EXACT-tuned scoreMatch is low (different size/variant). */
function titleSimilarity(a: NormalizedListing, b: NormalizedListing): number {
  const ta = new Set(baseTokens(`${a.brand ?? ""} ${a.title ?? ""}`));
  const tb = new Set(baseTokens(`${b.brand ?? ""} ${b.title ?? ""}`));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Classify a product pair. Pure + deterministic (Phase 1). The optional
 * `override` lets stored admin decisions force a result (feedback loop).
 */
export function classifyProductPair(
  a: NormalizedListing,
  b: NormalizedListing,
  override?: MatchDecision,
): MatchResult {
  if (override) {
    return { decision: override, confidence: 1, method: "deterministic", reasons: ["admin_override"] };
  }

  // 1) Deterministic exact identifiers.
  if (sharedBarcode(a, b)) {
    return { decision: "EXACT_MATCH", confidence: 0.99, method: "deterministic", reasons: ["shared_barcode"] };
  }
  if (sameBrandModel(a, b)) {
    // Brand + model agree — but if the titles clearly diverge (e.g. "5-Grain" vs
    // "10-Grain", different pack/variant sharing a model), treat it as a variant
    // (SIMILAR), not the identical product. Title agreement confirms EXACT.
    const ts = titleSimilarity(a, b);
    if (ts >= 0.45) {
      return { decision: "EXACT_MATCH", confidence: 0.95, method: "deterministic", reasons: ["same_brand_model"] };
    }
    return { decision: "SIMILAR_ALTERNATIVE", confidence: Math.max(0.6, ts), method: "deterministic", reasons: ["same_brand_model_title_diverges"] };
  }

  // 2) Structured attribute/title scoring.
  const match = matchListings(a, b);
  const score = scoreMatch(a, b);
  const conf = Math.max(0, Math.min(1, score.score / 100));
  const reasons = [...new Set([...match.reasons, ...score.reasons])];
  const catOk = sameCategory(a, b);

  // EXACT only with same category AND very high structured similarity.
  if (catOk && match.isMatch && conf >= EXACT_MIN_CONFIDENCE && !score.hardReject) {
    return { decision: "EXACT_MATCH", confidence: conf, method: "deterministic", reasons: [...reasons, "high_attr_similarity"] };
  }

  // SIMILAR: same category/function + meaningful title/attribute overlap (brand
  // may differ). Confidence blends the structured score with title overlap so
  // related products (different size/variant) still register as alternatives.
  // High title overlap is itself a same-function signal, so SIMILAR fires on it
  // even when category STRINGS differ (catalogs label categories inconsistently).
  const titleSim = titleSimilarity(a, b);
  const similarConf = Math.max(conf, titleSim);
  if ((catOk || titleSim >= SIMILAR_MIN_CONFIDENCE) && similarConf >= SIMILAR_MIN_CONFIDENCE && !score.hardReject) {
    // Capped below EXACT_MIN so a near-miss never masquerades as exact.
    return {
      decision: "SIMILAR_ALTERNATIVE",
      confidence: Math.min(similarConf, EXACT_MIN_CONFIDENCE - 0.01),
      method: "deterministic",
      reasons: [...reasons, `title_overlap_${titleSim.toFixed(2)}`],
    };
  }

  return { decision: "DIFFERENT", confidence: Math.max(conf, titleSim), method: "deterministic", reasons: reasons.length ? reasons : ["no_meaningful_overlap"] };
}
