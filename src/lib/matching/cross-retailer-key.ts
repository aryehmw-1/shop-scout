// Cross-retailer product identity. Returns the STRONGEST available linking key
// so the same product from Amazon / Walmart / Target / IKEA collapses to one
// canonical product with multiple retailer offers.
//
// Tier order (most → least authoritative):
//   1. code:<gtin14>           — shared UPC/EAN/GTIN (exact)
//   2. model:<brand>:<mpn>     — same brand + model number
//   3. fuzzy:<brand>:<size>:<tokens> — same brand + same size/capacity + the
//      key product nouns. SIZE IS PART OF THE KEY so "13 gallon" never merges
//      with "20 gallon", and "12 oz" never merges with "32 oz".
//
// The fuzzy tier is deliberately conservative: it requires a brand AND (a parsed
// size OR ≥2 distinct core nouns). Marketing words, pack/units, and bare numbers
// are stripped so retailer title differences don't block a real match.

export interface ProductIdentity {
  brand?: string | null;
  brandCanonical?: string | null;
  title?: string | null;
  upc?: string | null;
  gtin?: string | null;
  ean?: string | null;
  mpn?: string | null;
  modelNumber?: string | null;
  sizeLabel?: string | null;
}

export type MatchTier = "barcode" | "model" | "fuzzy" | "none";

const STOPWORDS = new Set([
  "the", "a", "an", "for", "with", "and", "or", "of", "to", "in", "on", "by",
  "from", "your", "you", "our", "we", "all", "new", "free", "shipping", "value",
  "great", "best", "premium", "quality", "original", "pack", "count", "ct", "oz",
  "fl", "ml", "lb", "lbs", "gal", "gallon", "qt", "quart", "pint", "size", "ea",
  "each", "case", "box", "bag", "bags", "roll", "rolls", "set", "kit", "x",
  "plus", "ultra", "max", "more", "less", "scent", "scented", "flavor",
]);

function norm(s?: string | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** GTIN-14 normalized barcode, or "" when none usable. */
function barcode(id: ProductIdentity): string {
  const digits = (id.upc || id.gtin || id.ean || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-14).padStart(14, "0") : "";
}

const SIZE_PATTERNS: [RegExp, string][] = [
  [/(\d+(?:\.\d+)?)\s*(?:gallon|gal)\b/, "gal"],
  [/(\d+(?:\.\d+)?)\s*(?:fl\s*oz|fluid ounce|oz|ounce)\b/, "oz"],
  [/(\d+(?:\.\d+)?)\s*(?:quart|qt)\b/, "qt"],
  [/(\d+(?:\.\d+)?)\s*(?:milliliter|ml)\b/, "ml"],
  [/(\d+(?:\.\d+)?)\s*(?:liter|litre|l)\b/, "l"],
  [/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound)\b/, "lb"],
  [/(\d+(?:\.\d+)?)\s*(?:loads?)\b/, "load"],
  // Count/pack in many phrasings: "100 count", "pack of 24", "(6 bag)", "12 pk".
  [/(\d+)\s*(?:count|ct|pack|pk|rolls?|sheets?|bags?|pods?|capsules?|tablets?|wipes|bottles?|bars?|cans?)\b/, "ct"],
  [/\bpack of\s*(\d+)/, "ct"],
];

/** ALL size/capacity signals in sizeLabel + title, e.g. {oz:92, ct:6}. Used so
 *  products differing in ANY present dimension (volume OR pack count) don't
 *  wrongly merge ("Pack of 6" ≠ "Pack of 24"). */
export function parseSizes(id: ProductIdentity): Record<string, number> {
  const hay = `${id.sizeLabel ?? ""} ${id.title ?? ""}`.toLowerCase();
  const out: Record<string, number> = {};
  for (const [re, unit] of SIZE_PATTERNS) {
    const m = hay.match(re);
    if (m && out[unit] === undefined) out[unit] = parseFloat(m[1]);
  }
  return out;
}

/** First (most authoritative) size token, e.g. "gal13"/"oz92"/"ct100", or "". */
export function parseSizeToken(id: ProductIdentity): string {
  const sizes = parseSizes(id);
  for (const [, unit] of SIZE_PATTERNS) {
    if (sizes[unit] !== undefined) return `${unit}${sizes[unit]}`;
  }
  return "";
}

/** Core product nouns from the title (brand + marketing + units + numbers
 *  stripped), de-duplicated, sorted, capped — so retailer title variations map
 *  to the same token set. */
export function coreTokens(id: ProductIdentity, max = 4): string[] {
  const brandWords = new Set(
    `${id.brand ?? ""} ${id.brandCanonical ?? ""}`.toLowerCase().split(/\s+/).filter(Boolean),
  );
  const words = `${id.title ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 2 &&
        !STOPWORDS.has(w) &&
        !brandWords.has(w) &&
        !/^\d+$/.test(w),
    );
  return [...new Set(words)].sort().slice(0, max);
}

/**
 * Strongest cross-retailer key for a product, with its tier. `null` key when the
 * product is too thin to link safely (no barcode, no model, and not enough title
 * signal) — such products stay standalone rather than risk a bad merge.
 */
export function crossRetailerKey(id: ProductIdentity): { key: string | null; tier: MatchTier } {
  const code = barcode(id);
  if (code) return { key: `code:${code}`, tier: "barcode" };

  const brand = norm(id.brandCanonical || id.brand);
  const model = norm(id.mpn || id.modelNumber);
  // Only treat a model as a CROSS-retailer identifier when it's a real
  // manufacturer part number — NOT a retailer-specific SKU. We previously stored
  // ASINs / Walmart item ids / Target TCINs in `mpn`, and those never match
  // across retailers, so keying on them blocks legitimate fuzzy merges. Skip
  // ASIN-shaped (B0xxxxxxxx) and pure-numeric (≥6-digit) SKUs → fall to fuzzy.
  const looksLikeRetailerSku = /^b0[a-z0-9]{8,9}$/.test(model) || /^\d{6,}$/.test(model);
  if (brand && model && model.length >= 3 && !looksLikeRetailerSku) {
    return { key: `model:${brand}:${model}`, tier: "model" };
  }

  if (brand) {
    const size = parseSizeToken(id);
    const tokens = coreTokens(id);
    // Require a real signal: a size OR at least two core nouns.
    if (size || tokens.length >= 2) {
      return { key: `fuzzy:${brand}:${size}:${tokens.join("-")}`, tier: "fuzzy" };
    }
  }

  return { key: null, tier: "none" };
}
