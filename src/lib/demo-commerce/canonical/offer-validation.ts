import { titleSimilarity } from "../amazon-enrichment/similarity";
import { retailerAllowsCategory, type TopLevelCategory } from "../taxonomy";
import type { RetailerOffer } from "./types";
import type { RetailerId } from "@/lib/types";

const MIN_OFFER_CONFIDENCE = 0.52;
const MIN_TITLE_SIMILARITY = 0.28;

export function scoreOfferConfidence(opts: {
  canonicalTitle: string;
  storeTitle?: string;
  productUrl: string;
  linkType: RetailerOffer["link_type"];
  retailer: RetailerId;
  category: TopLevelCategory | string;
}): number {
  const compareTitle = opts.storeTitle ?? opts.canonicalTitle;
  const sim = titleSimilarity(opts.canonicalTitle, compareTitle);

  let score = sim * 0.45;
  if (opts.linkType === "pdp") score += 0.35;
  else if (opts.linkType === "search") score += 0.2;
  else score += 0.05;

  if (retailerAllowsCategory(opts.retailer, opts.category as TopLevelCategory)) {
    score += 0.12;
  } else {
    score -= 0.35;
  }

  try {
    const u = new URL(opts.productUrl);
    if (u.pathname === "/" || !u.pathname) return 0;
    if (/google\.com\/search/i.test(opts.productUrl)) return 0.1;
  } catch {
    return 0;
  }

  return Math.min(1, Math.round(score * 1000) / 1000);
}

export function isValidRetailerOffer(
  offer: RetailerOffer,
  canonicalTitle: string,
  category: TopLevelCategory | string,
): boolean {
  if (offer.confidence_score < MIN_OFFER_CONFIDENCE) return false;
  if (!offer.product_url.startsWith("https://")) return false;
  if (offer.price <= 0) return false;

  const sim = titleSimilarity(
    canonicalTitle,
    offer.store_title ?? canonicalTitle,
  );
  if (sim < MIN_TITLE_SIMILARITY && offer.link_type === "search") return false;

  if (!retailerAllowsCategory(offer.retailer, category as TopLevelCategory)) {
    return false;
  }

  return true;
}

export function filterValidOffers(
  offers: RetailerOffer[],
  canonicalTitle: string,
  category: TopLevelCategory | string,
): RetailerOffer[] {
  return offers
    .filter((o) => isValidRetailerOffer(o, canonicalTitle, category))
    .sort((a, b) => a.price - b.price);
}
