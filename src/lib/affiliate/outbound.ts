import type { ProductOffer } from "../types";
import { buildAffiliateUrl } from "../affiliate";
import { allExperimentVariants } from "../experiments/flags";

export interface OutboundClickContext {
  catalogId?: string;
  searchQuery?: string;
  source?: "card" | "compare" | "hero" | "table";
}

/** Build commission-safe redirect URL through /api/outbound (logs click before redirect). */
export function buildOutboundUrl(
  offer: ProductOffer,
  ctx: OutboundClickContext = {},
): string {
  const affiliateUrl =
    offer.affiliateUrl ||
    buildAffiliateUrl(offer.retailer, offer.productUrl ?? "");

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

function encodeBase64Url(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode affiliate destination from outbound query param. */
export function decodeOutboundTarget(encoded: string): string | null {
  try {
    const url = Buffer.from(encoded, "base64url").toString("utf8");
    if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
    return url;
  } catch {
    return null;
  }
}
