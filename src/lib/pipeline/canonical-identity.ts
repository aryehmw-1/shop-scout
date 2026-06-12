// Pure canonical-identity helpers (no DB, no server-only) so they can be unit
// tested and reused on either side. The DB-writing canonical creation lives in
// canonical.ts and builds on these.

import type { NormalizedListing } from "./types";

/**
 * A deterministic identity key for a listing, most-authoritative first:
 *   barcode (upc/gtin/ean) → brand+model → brand+title+size+pack.
 * Listings that share a key are the same purchasable product across retailers.
 * Returns null when the listing is too thin to group safely.
 */
export function duplicateGroupKey(listing: NormalizedListing): string | null {
  const digits = (listing.upc || listing.gtin || listing.ean || "").replace(/\D/g, "");
  if (digits.length >= 8) {
    // GTIN-14 normalize (left-pad) so UPC-A / EAN-13 / GTIN forms of the SAME
    // barcode collapse to one key (e.g. 0001234567890 ≡ 1234567890).
    const gtin14 = digits.slice(-14).padStart(14, "0");
    return `code:${gtin14}`;
  }

  const brand = listing.brandNormalized?.trim();
  if (brand && listing.modelNumberNormalized) {
    return `model:${brand}:${listing.modelNumberNormalized}`;
  }

  if (brand && listing.titleNormalized) {
    const size =
      listing.sizeValue !== undefined && listing.sizeUnit
        ? `${listing.sizeValue}${listing.sizeUnit}`
        : "";
    const pack = listing.packCount !== undefined ? `x${listing.packCount}` : "";
    return `bts:${brand}:${listing.titleNormalized}:${size}:${pack}`;
  }

  return null;
}

/**
 * Assign a shared duplicateGroupId to a set of listings. Pure: returns a map of
 * record id → groupId (the canonical group key). Records that can't be keyed are
 * omitted (they should go to NEEDS_REVIEW, never silently grouped).
 */
export function assignDuplicateGroups(
  records: Array<{ id: string; listing: NormalizedListing }>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of records) {
    const key = duplicateGroupKey(r.listing);
    if (key) out.set(r.id, key);
  }
  return out;
}

/** Minimum confidence to mint a brand-new canonical product from a raw record. */
export const CANONICAL_CREATE_MIN_SCORE = 85;

/**
 * Is it SAFE to create a new canonical product from this verified raw record?
 * Requires BOTH a strong, stable identity (a barcode or a brand+model) AND a
 * high confidence score. Anything weaker must go to NEEDS_REVIEW so we never
 * pollute the catalog with guesses.
 */
export function isCanonicalCreationSafe(
  listing: NormalizedListing,
  score: number,
): boolean {
  if (score < CANONICAL_CREATE_MIN_SCORE) return false;
  const hasBarcode = Boolean(listing.upc || listing.gtin || listing.ean);
  const hasBrandModel = Boolean(listing.brandNormalized && listing.modelNumberNormalized);
  if (!hasBarcode && !hasBrandModel) return false;
  return Boolean(listing.title && listing.brand && listing.price && listing.price > 0);
}

export function slugForProduct(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

/**
 * ASCII-folded, de-duplicated search tokens from a title (+brand). Strips
 * diacritics (BESTÅ → besta, TÄRNABY → tarnaby) so plain-text chat queries match
 * Scandinavian/accented product names.
 */
export function searchKeywords(title: string, brand?: string): string[] {
  const text = `${brand ?? ""} ${title}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .toLowerCase();
  const tokens = text
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
  return [...new Set(tokens)];
}

/** Short stable suffix so slugs/catalogIds don't collide. */
export function shortHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 6);
}
