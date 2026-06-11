// Stage 1 — automated rule-based validation (RAW → CHECKED | REJECTED).
//
// Cheap, deterministic field/price/URL checks run BEFORE any matching. A record
// that fails badly is REJECTED outright; otherwise it advances to CHECKED.
// URL liveness checks are optional (a network round-trip) so callers can skip
// them in tight loops and run them in the nightly job instead.

import type { NormalizedListing } from "./types";

export interface RequiredFieldResult {
  ok: boolean;
  reasons: string[];
  hardReject: boolean;
}

// Coarse sane price ceilings per category — anything above is "impossible".
const PRICE_CEILING: Record<NormalizedListing["categoryKind"], number> = {
  grocery: 500,
  household: 1_000,
  electronics: 50_000,
  apparel: 5_000,
  general: 100_000,
};

/** Required-field + price sanity checks. No network calls. */
export function checkRequiredFields(listing: NormalizedListing): RequiredFieldResult {
  const reasons: string[] = [];
  let hardReject = false;

  if (!listing.title || listing.titleNormalized.length < 2) {
    reasons.push("missing_title");
    hardReject = true;
  }
  if (!listing.productUrl) {
    reasons.push("missing_product_url");
    hardReject = true;
  }
  if (listing.price === undefined || listing.price === null) {
    reasons.push("missing_price");
  } else if (listing.price <= 0) {
    reasons.push("non_positive_price");
    hardReject = true;
  } else if (listing.price > PRICE_CEILING[listing.categoryKind]) {
    reasons.push("impossible_price");
    hardReject = true;
  }
  if (!listing.imageUrl) {
    reasons.push("missing_image");
  }

  // Brand should be compatible with the title (appear in it) when both exist.
  if (listing.brandNormalized && listing.titleNormalized) {
    const brandTokens = listing.brandNormalized.split(" ").filter((t) => t.length > 1);
    const titleHasBrand = brandTokens.some((t) => listing.titleNormalized.includes(t));
    if (brandTokens.length && !titleHasBrand) reasons.push("brand_title_mismatch");
  }

  return { ok: !hardReject, reasons, hardReject };
}

export interface UrlLivenessResult {
  imageOk: boolean;
  productOk: boolean;
  reasons: string[];
}

async function headOk(url: string | undefined, timeoutMs: number): Promise<boolean> {
  if (!url || !/^https?:\/\//.test(url)) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Some CDNs reject HEAD — fall back to a ranged GET.
    let res = await fetch(url, { method: "HEAD", signal: ctrl.signal, redirect: "follow" });
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: ctrl.signal,
        redirect: "follow",
      });
    }
    return res.ok || res.status === 206;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Optional network check that image + product URLs return 200. */
export async function checkUrlLiveness(
  listing: NormalizedListing,
  timeoutMs = 6_000,
): Promise<UrlLivenessResult> {
  const [imageOk, productOk] = await Promise.all([
    headOk(listing.imageUrl, timeoutMs),
    headOk(listing.productUrl, timeoutMs),
  ]);
  const reasons: string[] = [];
  if (!imageOk) reasons.push("image_url_unreachable");
  if (!productOk) reasons.push("product_url_unreachable");
  return { imageOk, productOk, reasons };
}
