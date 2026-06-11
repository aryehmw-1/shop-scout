// Normalization utilities for the verification pipeline.
//
// Matching is only as good as normalization: "92 fl oz" and "92 oz" must compare
// equal, while "92 oz" and "46 oz" must compare DIFFERENT. These are pure
// functions so they can be unit-tested without a database or network.

import type { ProductCategoryKind } from "./types";

const WHITESPACE = /\s+/g;

/** Lowercase, strip punctuation/marketing noise, collapse whitespace. */
export function normalizeTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[®™©]/g, "")
    .replace(/[^a-z0-9.\-/+ ]/g, " ")
    .replace(/\b(brand new|new|genuine|official|authentic|free shipping|best seller)\b/g, " ")
    .replace(WHITESPACE, " ")
    .trim();
}

const BRAND_ALIASES: Record<string, string> = {
  "p&g": "procter and gamble",
  "pg": "procter and gamble",
  "coca cola": "coca-cola",
  coke: "coca-cola",
  "hp inc": "hp",
  "hewlett packard": "hp",
  "apple inc": "apple",
  amazonbasics: "amazon basics",
};

export function normalizeBrand(raw: string | null | undefined): string {
  if (!raw) return "";
  const base = raw
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/\b(inc|llc|co|corp|ltd|company)\b\.?/g, "")
    .replace(/[^a-z0-9& -]/g, " ")
    .replace(WHITESPACE, " ")
    .trim();
  return BRAND_ALIASES[base] ?? base;
}

// Canonical unit names — everything maps to one of these.
const UNIT_ALIASES: Record<string, string> = {
  "fl oz": "oz",
  "fluid ounce": "oz",
  "fluid ounces": "oz",
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  gal: "gallon",
  gallon: "gallon",
  gallons: "gallon",
  qt: "quart",
  quart: "quart",
  quarts: "quart",
  pt: "pint",
  pint: "pint",
  ct: "count",
  count: "count",
  pk: "pack",
  pack: "pack",
};

export interface SizeParse {
  normalized?: string; // "92 oz"
  value?: number; // 92
  unit?: string; // "oz"
}

/**
 * Parse a size/quantity string into a normalized {value, unit}. Handles
 * "92 fl oz" → 92 oz, "gal" → 1 gallon, "1.5 L" → 1.5 l, "half gallon" → 0.5 gallon.
 */
export function normalizeSize(raw: string | null | undefined): SizeParse {
  if (!raw) return {};
  const t = raw.toLowerCase().replace(/[,]/g, "").trim();

  // Worded fractions that matter for grocery (gallon vs half gallon).
  const worded = t.match(/\b(half|quarter|one|two|three)\s+(gallon|pint|quart|liter|litre)\b/);
  if (worded) {
    const map: Record<string, number> = { half: 0.5, quarter: 0.25, one: 1, two: 2, three: 3 };
    const unit = canonicalUnit(worded[2]);
    const value = map[worded[1]] ?? 1;
    return { value, unit, normalized: `${value} ${unit}` };
  }

  const m = t.match(/(\d+(?:\.\d+)?)\s*-?\s*(fl\s*oz|fluid\s*ounces?|[a-z]+)/);
  if (!m) return {};
  const value = parseFloat(m[1]);
  const unit = canonicalUnit(m[2].replace(/\s+/g, " ").trim());
  if (!unit || Number.isNaN(value)) return {};
  return { value, unit, normalized: `${trimFloat(value)} ${unit}` };
}

function canonicalUnit(raw: string): string | undefined {
  const k = raw.trim();
  return UNIT_ALIASES[k] ?? (/^[a-z]+$/.test(k) ? undefined : undefined);
}

/**
 * Extract a pack/multi count: "2-pack", "pack of 2", "12 count", "12ct", "x2".
 * Returns undefined when there's no explicit multipack signal.
 */
export function normalizePackCount(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const t = raw.toLowerCase();
  const patterns: RegExp[] = [
    /\bpack of (\d+)\b/,
    /\b(\d+)\s*-?\s*pack\b/,
    /\b(\d+)\s*-?\s*(?:ct|count)\b/,
    /\b(\d+)\s*-?\s*pk\b/,
    /\bx\s*(\d+)\b/,
    /\b(\d+)\s*pcs?\b/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 1 && n < 10000) return n;
    }
  }
  return undefined;
}

/** Model / part numbers: uppercase, strip spaces and separators. */
export function normalizeModelNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toUpperCase()
    .replace(/[\s\-_/]/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

/**
 * Normalize a barcode to digits only and validate length. UPC-A=12, EAN-13=13,
 * EAN-8=8. A 12-digit UPC and its 13-digit EAN (leading 0) are treated as equal
 * by gtinEquivalent(). Returns "" when the value isn't a plausible barcode.
 */
export function normalizeGtin(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return "";
  return digits;
}

/** True when two barcodes refer to the same item, accounting for GTIN padding. */
export function gtinEquivalent(a: string, b: string): boolean {
  const x = normalizeGtin(a);
  const y = normalizeGtin(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // Compare as zero-padded GTIN-14.
  return x.padStart(14, "0") === y.padStart(14, "0");
}

const COLOR_ALIASES: Record<string, string> = {
  grey: "gray",
  "space grey": "space gray",
  "space gray": "space gray",
  midnight: "black",
  graphite: "gray",
};

export function normalizeColor(raw: string | null | undefined): string {
  if (!raw) return "";
  const base = raw.toLowerCase().replace(/[^a-z ]/g, " ").replace(WHITESPACE, " ").trim();
  return COLOR_ALIASES[base] ?? base;
}

export function normalizeVariant(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(WHITESPACE, " ").trim();
}

/** Infer the coarse category bucket that drives category-specific rules. */
export function inferCategoryKind(
  category: string | null | undefined,
  title: string | null | undefined,
): ProductCategoryKind {
  const cat = (category ?? "").toLowerCase();
  // Honor an explicit category label first (e.g. "electronics", "apparel").
  if (/\bgrocer|\bfood\b/.test(cat)) return "grocery";
  if (/household|cleaning/.test(cat)) return "household";
  if (/electronic|tech|computer/.test(cat)) return "electronics";
  if (/apparel|clothing|fashion|shoe/.test(cat)) return "apparel";

  const hay = `${category ?? ""} ${title ?? ""}`.toLowerCase();
  if (/\b(grocery|food|milk|cereal|coffee|snack|beverage|produce|dairy|pantry|water|soda)\b/.test(hay)) {
    return "grocery";
  }
  if (/\b(detergent|cleaner|paper towel|toilet|laundry|dish|trash bag|household|soap|wipes)\b/.test(hay)) {
    return "household";
  }
  if (/\b(phone|laptop|tv|headphone|earbud|camera|console|monitor|tablet|charger|gpu|ssd|router|speaker|watch)\b/.test(hay)) {
    return "electronics";
  }
  if (/\b(shirt|pants|jeans|dress|shoe|sneaker|jacket|hoodie|apparel|clothing|sock|hat|coat)\b/.test(hay)) {
    return "apparel";
  }
  return "general";
}

/** Token-overlap (Jaccard) similarity of two already-normalized titles, 0–1. */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function trimFloat(n: number): number {
  return Math.round(n * 1000) / 1000;
}
