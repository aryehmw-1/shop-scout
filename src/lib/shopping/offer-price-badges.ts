import type { ProductOffer } from "../types";
import { formatScrapeAgeLabel } from "../offers/offer-pipeline-meta";
import { isVerifiedOffer } from "../offers/offer-trust";
import { getOfferPriceDisplay } from "./offer-price-display";

export type VisiblePriceBadge =
  | "VERIFIED LIVE PRICE"
  | "VERIFIED PRICE"
  | "ESTIMATED PRICE"
  | "PRICE UNAVAILABLE"
  | null;

export function visiblePriceBadge(offer: ProductOffer): VisiblePriceBadge {
  const display = getOfferPriceDisplay(offer);
  if (display.badgeLabel) return display.badgeLabel;
  if (display.main === "Price unavailable") return "PRICE UNAVAILABLE";
  if (isVerifiedOffer(offer)) return "VERIFIED LIVE PRICE";
  return "ESTIMATED PRICE";
}

export function scrapeAgeBadge(offer: ProductOffer): string | null {
  if (offer.priceSource !== "scraped" && offer.priceSource !== "connector_api") {
    return null;
  }
  return formatScrapeAgeLabel(offer);
}
