import { titleSimilarity } from "../catalog/title-similarity";
import { brandsMatch } from "./normalize-brand";
import { attributeOverlapScore, normalizeAttributes } from "./normalize-attributes";
import {
  identifiersExactMatch,
  mergeIdentifiers,
  primaryGtinFamily,
} from "./product-identifiers";
import type {
  CanonicalProductRef,
  ConfidenceBreakdown,
  ConfidenceReason,
  ObservedListing,
  VariantGroupRef,
  VariantSizeRef,
} from "./types";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function reason(code: string, message: string, weight: number): ConfidenceReason {
  return { code, message, weight };
}

export interface MatchContext {
  product: CanonicalProductRef;
  variantGroup?: VariantGroupRef;
  variant?: VariantSizeRef;
  observed: ObservedListing;
  imageConfidence?: number;
}

/**
 * Deterministic match confidence with explicit reason codes.
 * Priority: UPC/GTIN > brand > variant group/color > size > title similarity.
 */
export function scoreMatchConfidence(ctx: MatchContext): ConfidenceBreakdown {
  const reasons: ConfidenceReason[] = [];
  let identity = 0.35;
  let attributes = 0.4;
  let match = 0.45;

  const catalogIds = mergeIdentifiers(
    ctx.product.identifiers,
    ctx.variantGroup?.identifiers,
    ctx.variant?.identifiers,
  );
  const observedIds = mergeIdentifiers(ctx.observed.identifiers);

  const idMatch = identifiersExactMatch(catalogIds, observedIds);
  if (idMatch.match) {
    identity = 1;
    match = 0.97;
    attributes = Math.max(attributes, 0.85);
    reasons.push(reason("identity.upc", idMatch.reason ?? "same UPC/GTIN", 0.45));
  } else if (
    primaryGtinFamily(catalogIds) &&
    primaryGtinFamily(observedIds) &&
    primaryGtinFamily(catalogIds) !== primaryGtinFamily(observedIds)
  ) {
    identity = 0.05;
    match = 0.12;
    reasons.push(reason("identity.mismatch", "conflicting GTIN/UPC", -0.5));
    return finalize(match, identity, attributes, ctx.imageConfidence ?? 0.5, reasons);
  }

  const expectedAttrs = normalizeAttributes({
    brand: ctx.product.brandCanonical ?? ctx.product.brand,
    color: ctx.variantGroup?.colorNormalized ?? ctx.variantGroup?.color,
    size: ctx.variant?.sizeNormalized ?? ctx.variant?.sizeLabel,
    category: ctx.product.category,
  });
  const observedAttrs = normalizeAttributes({
    brand: ctx.observed.brandRaw ?? ctx.product.brand,
    color: ctx.observed.colorRaw,
    size: ctx.observed.sizeRaw,
    category: ctx.product.category,
  });

  if (brandsMatch(ctx.product.brand, ctx.observed.brandRaw ?? ctx.product.brand)) {
    identity = Math.max(identity, idMatch.match ? 1 : 0.78);
    match = Math.max(match, 0.72);
    reasons.push(reason("brand.match", "same brand", 0.2));
  }

  const attrScore = attributeOverlapScore(expectedAttrs, observedAttrs);
  if (attrScore.reasons.length > 0) {
    attributes = clamp01(0.35 + attrScore.score * 0.6);
    match = Math.max(match, attributes);
    for (const r of attrScore.reasons) {
      reasons.push(reason(`attr.${r.replace(/\s+/g, "_")}`, r, 0.08));
    }
  }

  if (
    ctx.variantGroup?.colorNormalized &&
    observedAttrs.colorNormalized &&
    ctx.variantGroup.colorNormalized === observedAttrs.colorNormalized
  ) {
    match = Math.max(match, 0.8);
    reasons.push(reason("variant.color", "same variant color", 0.12));
  }

  if (
    ctx.variant?.sizeNormalized &&
    observedAttrs.sizeNormalized &&
    ctx.variant.sizeNormalized === observedAttrs.sizeNormalized
  ) {
    match = Math.max(match, 0.82);
    reasons.push(reason("variant.size", "size compatible", 0.1));
  }

  const titleA = ctx.product.title;
  const titleB = ctx.observed.storeTitle ?? "";
  if (ctx.observed.urlIsSearch) {
    match = Math.min(match, 0.52);
    identity = Math.min(identity, 0.55);
    reasons.push(reason("url.search", "search URL not verified PDP", -0.22));
  }

  if (ctx.observed.priceSource === "catalog_model") {
    match = Math.min(match, 0.48);
    reasons.push(reason("price.estimated", "estimated price only", -0.18));
  }

  if (titleA && titleB) {
    const sim = titleSimilarity(titleA, titleB);
    const titleBoost = sim * 0.2;
    if (sim >= 0.55) {
      match = clamp01(match + titleBoost);
      reasons.push(reason("title.similarity", "semantic title similarity", titleBoost));
    } else if (!idMatch.match && sim < 0.42) {
      match = Math.min(match, 0.45);
      reasons.push(reason("title.weak", "weak title overlap", -0.2));
    }
  }

  if (idMatch.match) {
    match = Math.max(match, 0.97);
    identity = 1;
  }

  return finalize(match, identity, attributes, ctx.imageConfidence ?? 0.5, reasons);
}

function finalize(
  match: number,
  identity: number,
  attributes: number,
  image: number,
  reasons: ConfidenceReason[],
): ConfidenceBreakdown {
  const matchConfidence = clamp01(match);
  const identityConfidence = clamp01(identity);
  const attributeConfidence = clamp01(attributes);
  const imageConfidence = clamp01(image);

  const weighted =
    identityConfidence * 0.4 +
    attributeConfidence * 0.3 +
    matchConfidence * 0.2 +
    imageConfidence * 0.1;

  return {
    matchConfidence: clamp01(weighted),
    identityConfidence,
    attributeConfidence,
    imageConfidence,
    confidenceReasons: reasons.sort((a, b) => b.weight - a.weight),
  };
}

export function confidenceReasonsToJson(reasons: ConfidenceReason[]): string {
  return JSON.stringify(
    reasons.map((r) => ({ code: r.code, message: r.message, weight: r.weight })),
  );
}

export function shouldOverrideSemanticMatch(breakdown: ConfidenceBreakdown): boolean {
  return breakdown.identityConfidence >= 0.99;
}
