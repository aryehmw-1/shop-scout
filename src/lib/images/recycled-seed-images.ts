/**
 * The intelligence-graph SEED recycles a handful of Amazon image IDs across many
 * UNRELATED products — e.g. the MacBook photo `71vFKBpKakL` is assigned to the
 * Ninja Air Fryer, Clorox Bleach, Crocs, Neutrogena sunscreen, Pyrex, and
 * Starbucks coffee. An image reused across distinct products cannot be the right
 * product photo, so we treat these as UNTRUSTWORTHY and render a neutral category
 * placeholder instead of a misleading image (better no image than the wrong one).
 *
 * These are the Amazon image IDs used by >1 canonical product in
 * `data/intelligence-graph/products`. Real, UNIQUE product images never appear
 * here. `recycled-seed-images.test.ts` re-scans the seed and fails if a new
 * shared image appears (so this list can't silently drift).
 */
export const RECYCLED_SEED_IMAGE_IDS: ReadonlySet<string> = new Set([
  "61-PblYntsL",
  "61SUj2aKoEL",
  "71vFKBpKakL",
  "81KYNQ+KZJL",
  "71j+1H6qY9L",
  "71U2+5Y5HHL",
  "71aFt4+OTOL",
  "61fD85FMQtL",
]);

/** Extract the Amazon media image id, e.g. `.../I/71vFKBpKakL._AC_SL1500_.jpg`
 *  → `71vFKBpKakL`. Returns null for non-Amazon-media URLs. */
export function amazonImageId(url: string): string | null {
  const m = /\/images\/I\/([^./]+)\./.exec(url);
  return m ? m[1] : null;
}

/** True when an image URL is a recycled seed placeholder (shared across multiple
 *  unrelated products) — i.e. it must not be shown as a product photo. */
export function isRecycledSeedImage(url: string | undefined | null): boolean {
  if (!url) return false;
  const id = amazonImageId(url);
  return id !== null && RECYCLED_SEED_IMAGE_IDS.has(id);
}

/**
 * Real product photo from an Amazon ASIN via Amazon's public image-by-ASIN
 * endpoint (no API key). Returns the AUTHORITATIVE image for that exact product,
 * so an air fryer shows an air fryer. An invalid ASIN returns Amazon's tiny blank
 * placeholder (never an unrelated product), so this is always safe. Returns null
 * for a malformed ASIN.
 */
export function amazonAsinImageUrl(asin: string | undefined | null): string | null {
  if (!asin) return null;
  const clean = asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(clean)) return null;
  return `https://images-na.ssl-images-amazon.com/images/P/${clean}.01._SCLZZZZZZZ_.jpg`;
}
