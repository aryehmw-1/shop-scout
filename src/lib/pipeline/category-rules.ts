// Category-specific hard rules. These produce "critical differences" that block
// a match outright — the reject examples from the spec live here:
//   Tide 46 oz vs 92 oz · Coke 6-pack vs 12-pack · AirPods 4 vs AirPods Pro ·
//   gallon vs half gallon · Beats Black vs White · 16 oz vs 32 oz · case vs phone.

import { gtinEquivalent } from "./normalize";
import type { NormalizedListing, ProductCategoryKind } from "./types";

/** Does color/variant matter for this category? */
function variantMatters(kind: ProductCategoryKind): boolean {
  return kind === "apparel" || kind === "electronics";
}

/** Does exact size/quantity matter for this category? */
function sizeMatters(kind: ProductCategoryKind): boolean {
  return kind === "grocery" || kind === "household";
}

/**
 * Hard, non-overridable conflicts between two listings. A non-empty result means
 * "definitely NOT the same product" regardless of every other positive signal.
 */
export function criticalDifferences(a: NormalizedListing, b: NormalizedListing): string[] {
  const diffs: string[] = [];
  const kind = a.categoryKind === b.categoryKind ? a.categoryKind : "general";

  // Different barcodes when BOTH are present → different product, always.
  const aCodes = [a.upc, a.gtin, a.ean].filter(Boolean) as string[];
  const bCodes = [b.upc, b.gtin, b.ean].filter(Boolean) as string[];
  if (aCodes.length && bCodes.length) {
    const anyEqual = aCodes.some((x) => bCodes.some((y) => gtinEquivalent(x, y)));
    if (!anyEqual) diffs.push("different_barcode");
  }

  // Conflicting model numbers → different product, always.
  if (
    a.modelNumberNormalized &&
    b.modelNumberNormalized &&
    a.modelNumberNormalized !== b.modelNumberNormalized
  ) {
    diffs.push("different_model_number");
  }

  // Different size/quantity (16 oz vs 32 oz, gallon vs half gallon).
  if (a.sizeValue !== undefined && b.sizeValue !== undefined) {
    if (a.sizeUnit !== b.sizeUnit || Math.abs(a.sizeValue - b.sizeValue) > 1e-6) {
      diffs.push(sizeMatters(kind) ? "different_size_grocery" : "different_size");
    }
  }

  // Different pack count (6-pack vs 12-pack, 12 vs 24).
  if (a.packCount !== undefined && b.packCount !== undefined && a.packCount !== b.packCount) {
    diffs.push("different_pack_count");
  }

  // Different color/variant where it matters (Beats Black vs White, navy vs black shirt).
  if (variantMatters(kind)) {
    if (a.colorNormalized && b.colorNormalized && a.colorNormalized !== b.colorNormalized) {
      diffs.push("different_color");
    }
    if (a.variantNormalized && b.variantNormalized && a.variantNormalized !== b.variantNormalized) {
      diffs.push("different_variant");
    }
  }

  // Accessory vs device (iPhone 15 case vs iPhone 15 phone).
  if (isAccessory(a.titleNormalized) !== isAccessory(b.titleNormalized)) {
    diffs.push("accessory_vs_device");
  }

  return diffs;
}

const ACCESSORY_RE = /\b(case|cover|screen protector|charger|cable|adapter|strap|band|mount|sleeve|skin|stand)\b/;
function isAccessory(titleNormalized: string): boolean {
  return ACCESSORY_RE.test(titleNormalized);
}

export { sizeMatters, variantMatters };
