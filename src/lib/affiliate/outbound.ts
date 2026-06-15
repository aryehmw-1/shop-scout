import type { ProductOffer, RetailerId } from "../types";
import { buildAffiliateUrl } from "../affiliate";
import { allExperimentVariants } from "../experiments/flags";
import { decodeBase64Url, encodeBase64Url } from "../encoding/base64url";

export interface OutboundClickContext {
  catalogId?: string;
  searchQuery?: string;
  source?: "card" | "compare" | "hero" | "table" | "mobile_list";
}

/**
 * Retailers where we earn commission and MUST attach affiliate tracking before
 * showing an outbound link. If tracking can't be attached, the link is hidden
 * rather than shown raw (no un-monetized clicks to these partners).
 */
export const AFFILIATE_REQUIRED_RETAILERS: readonly RetailerId[] = ["amazon", "ebay"];

export function isAffiliateRequired(retailer: RetailerId): boolean {
  return AFFILIATE_REQUIRED_RETAILERS.includes(retailer);
}

/** Does this URL already carry the tracking param required for `retailer`? */
export function hasRequiredAffiliateTracking(retailer: RetailerId, url: string): boolean {
  if (!isAffiliateRequired(retailer)) return true;
  try {
    const params = new URL(url).searchParams;
    if (retailer === "amazon") return Boolean(params.get("tag")?.trim());
    if (retailer === "ebay") return Boolean(params.get("campid")?.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * Central affiliate-safe link builder. Returns the affiliate-tracked destination
 * URL, or `null` when the retailer requires affiliate tracking (Amazon / eBay)
 * but a valid tag/campaign could not be attached — in which case callers MUST
 * hide the outbound link. Never returns a raw, un-tracked Amazon/eBay link.
 */
export function affiliateSafeDestination(
  retailer: RetailerId,
  rawUrl: string | undefined,
  prebuiltAffiliateUrl?: string,
): string | null {
  if (!rawUrl && !prebuiltAffiliateUrl) return null;
  const candidate = prebuiltAffiliateUrl || buildAffiliateUrl(retailer, rawUrl ?? "");
  // If a prebuilt URL was passed but lacks tracking, try rebuilding from the raw URL.
  const url =
    hasRequiredAffiliateTracking(retailer, candidate) || !rawUrl
      ? candidate
      : buildAffiliateUrl(retailer, rawUrl);
  if (isAffiliateRequired(retailer) && !hasRequiredAffiliateTracking(retailer, url)) {
    return null;
  }
  return url;
}

/**
 * Lightweight "Go to store" href for surfaces that render a plain `<a>` (Saved,
 * Inventory). Non-affiliate retailers link directly to the (optionally tagged)
 * retailer URL. Affiliate-required retailers (Amazon/eBay) route through
 * /api/outbound with the RAW url so the server — which alone has the tag env —
 * attaches tracking. That way the button is never hidden just because the client
 * can't tag it. Returns `null` only when there is no URL at all.
 */
export function storeOutboundHref(
  retailer: RetailerId,
  rawUrl: string | undefined,
  prebuiltAffiliateUrl?: string,
  meta?: { offerId?: string; catalogId?: string; source?: OutboundClickContext["source"] },
): string | null {
  if (!isAffiliateRequired(retailer)) {
    return affiliateSafeDestination(retailer, rawUrl, prebuiltAffiliateUrl);
  }
  const raw = prebuiltAffiliateUrl || rawUrl;
  if (!raw) return null;
  const params = new URLSearchParams();
  params.set("to", encodeBase64Url(raw));
  params.set("r", retailer);
  if (meta?.offerId) params.set("oid", meta.offerId);
  if (meta?.catalogId) params.set("cid", meta.catalogId);
  if (meta?.source) params.set("src", meta.source);
  return `/api/outbound?${params.toString()}`;
}

/** Build commission-safe redirect URL through /api/outbound (logs click before
 * redirect). The server attaches affiliate tracking, so for Amazon/eBay we pass
 * the raw URL rather than hiding the link. Returns `null` only when no URL exists. */
export function buildOutboundUrl(
  offer: ProductOffer,
  ctx: OutboundClickContext = {},
): string | null {
  // Tagged URL when the client can build one; otherwise the raw URL, which
  // /api/outbound tags server-side before redirecting.
  const affiliateUrl =
    affiliateSafeDestination(offer.retailer, offer.productUrl ?? undefined, offer.affiliateUrl) ??
    offer.affiliateUrl ??
    offer.productUrl ??
    null;
  if (!affiliateUrl) return null;

  const params = new URLSearchParams();
  params.set("to", encodeBase64Url(affiliateUrl));
  params.set("oid", offer.id);
  params.set("r", offer.retailer);
  if (offer.catalogId ?? ctx.catalogId) {
    params.set("cid", offer.catalogId ?? ctx.catalogId!);
  }
  if (offer.price != null) params.set("p", String(offer.price));
  if (offer.isBestDeal) params.set("bd", "1");
  if (offer.dealScore != null) params.set("ds", String(offer.dealScore));
  if (offer.percentBelowMarket != null) {
    params.set("pbm", String(offer.percentBelowMarket));
  }
  if (ctx.source) params.set("src", ctx.source);
  if (ctx.searchQuery) params.set("q", ctx.searchQuery.slice(0, 120));

  const variants = allExperimentVariants();
  params.set("exp", JSON.stringify(variants));

  return `/api/outbound?${params.toString()}`;
}

/** Decode affiliate destination from outbound query param. Never throws. */
export function decodeOutboundTarget(encoded: string): string | null {
  const url = decodeBase64Url(encoded);
  if (!url) return null;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  return url;
}
