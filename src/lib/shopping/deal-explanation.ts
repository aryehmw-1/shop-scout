import type { ProductOffer } from "../types";
import { formatPrice } from "../utils/format";
import { formatLastVerified } from "./deal-display";
import { consumerConfidenceReason } from "./consumer-copy";

export interface DealExplanation {
  headline: string;
  bullets: string[];
  dealScore?: number;
  isGoodTimeToBuy?: boolean;
  goodTimeReason?: string;
}

export function buildDealExplanation(offer: ProductOffer): DealExplanation {
  const bullets: string[] = [];

  if (offer.percentBelowMarket != null && offer.percentBelowMarket > 0) {
    bullets.push(
      `${offer.percentBelowMarket}% below the verified market median${
        offer.marketMedianPrice ? ` (${formatPrice(offer.marketMedianPrice)})` : ""
      }`,
    );
  } else if (offer.percentBelowCatalog != null && offer.percentBelowCatalog > 0) {
    bullets.push(`${offer.percentBelowCatalog}% below catalog estimate`);
  }

  const verified = formatLastVerified(offer);
  if (verified) bullets.push(verified);

  if ((offer.matchConfidence ?? 0) >= 0.62) {
    bullets.push(
      `Trusted match (${Math.round((offer.matchConfidence ?? 0) * 100)}% confidence)`,
    );
  }

  if (offer.retailerTrustScore != null && offer.retailerTrustScore >= 0.65) {
    bullets.push(
      `Reliable ${offer.retailerName} track record (${Math.round(offer.retailerTrustScore * 100)}% retailer score)`,
    );
  }

  if (offer.isHistoricalLow) {
    bullets.push("Lowest verified price we've recorded for this product at this store");
  } else if (
    offer.movingAvgPrice &&
    offer.price < offer.movingAvgPrice * 0.97
  ) {
    bullets.push(
      `Near historical low — ${formatPrice(offer.price)} vs ${formatPrice(offer.movingAvgPrice)} avg`,
    );
  }

  if (offer.verificationCount != null && offer.verificationCount >= 2) {
    bullets.push(`Independently verified ${offer.verificationCount} times`);
  }

  if (offer.priceSource === "connector_api") {
    bullets.push("Recently verified from retailer");
  } else if (offer.priceSource === "scraped") {
    bullets.push("Verified live price");
  }

  const reasons =
    offer.confidenceReasons
      ?.map((r) => consumerConfidenceReason(r.message))
      .filter((r): r is string => Boolean(r)) ?? [];
  for (const r of reasons) {
    if (!bullets.some((b) => b.includes(r))) bullets.push(r);
  }

  let isGoodTimeToBuy = false;
  let goodTimeReason: string | undefined;
  if (offer.isHistoricalLow) {
    isGoodTimeToBuy = true;
    goodTimeReason = "At the lowest verified price we've seen";
  } else if ((offer.percentBelowMarket ?? 0) >= 8) {
    isGoodTimeToBuy = true;
    goodTimeReason = "Meaningfully below typical verified market price";
  } else if (
    offer.movingAvgPrice &&
    offer.price <= offer.movingAvgPrice * 0.95
  ) {
    isGoodTimeToBuy = true;
    goodTimeReason = "Below recent average for this store";
  }

  return {
    headline:
      offer.dealLabel === "best_deal" ? "Why this is the Best Deal"
      : offer.isGoodDeal ? "Why this is a strong price"
      : "Why we trust this offer",
    bullets: bullets.slice(0, 6),
    dealScore: offer.dealScore,
    isGoodTimeToBuy,
    goodTimeReason,
  };
}

export function attachDealExplanations(offers: ProductOffer[]): ProductOffer[] {
  return offers.map((o) => ({
    ...o,
    dealExplanation: buildDealExplanation(o),
  }));
}
