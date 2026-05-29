import type { ProductOffer } from "../types";
import { isDisplayableOffer } from "../offers/offer-persist-validation";

/** Minimum verified offers needed to compute a market median. */
export const MIN_MARKET_SAMPLE = 2;

/** Price below this fraction of market median is flagged suspicious. */
export const SUSPICIOUS_LOW_RATIO = 0.45;

export interface MarketPriceContext {
  catalogBasePrice: number;
  verifiedPrices: number[];
  marketMedian: number | null;
  marketMean: number | null;
  marketLow: number | null;
  marketHigh: number | null;
  sampleSize: number;
}

export function buildMarketPriceContext(
  offers: ProductOffer[],
  catalogBasePrice: number,
): MarketPriceContext {
  const verifiedPrices = offers
    .filter(isDisplayableOffer)
    .map((o) => o.price)
    .filter((p) => p > 0);

  if (verifiedPrices.length < MIN_MARKET_SAMPLE) {
    return {
      catalogBasePrice,
      verifiedPrices,
      marketMedian: null,
      marketMean: null,
      marketLow: verifiedPrices.length ? Math.min(...verifiedPrices) : null,
      marketHigh: verifiedPrices.length ? Math.max(...verifiedPrices) : null,
      sampleSize: verifiedPrices.length,
    };
  }

  const sorted = [...verifiedPrices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const marketMedian =
    sorted.length % 2 === 0 ?
      (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;

  const marketMean = verifiedPrices.reduce((a, b) => a + b, 0) / verifiedPrices.length;

  return {
    catalogBasePrice,
    verifiedPrices,
    marketMedian,
    marketMean,
    marketLow: sorted[0]!,
    marketHigh: sorted[sorted.length - 1]!,
    sampleSize: verifiedPrices.length,
  };
}

export function percentBelowMarket(price: number, marketMedian: number | null): number | null {
  if (!marketMedian || marketMedian <= 0 || price <= 0) return null;
  return Math.round(((marketMedian - price) / marketMedian) * 1000) / 10;
}

export function percentBelowCatalog(price: number, catalogBase: number): number | null {
  if (!catalogBase || catalogBase <= 0 || price <= 0) return null;
  return Math.round(((catalogBase - price) / catalogBase) * 1000) / 10;
}

export function isSuspiciouslyLowPrice(
  price: number,
  market: MarketPriceContext,
): { suspicious: boolean; reason?: string } {
  if (price <= 0) return { suspicious: true, reason: "zero_price" };

  if (market.marketMedian && price < market.marketMedian * SUSPICIOUS_LOW_RATIO) {
    return {
      suspicious: true,
      reason: `price $${price} is ${Math.round((price / market.marketMedian) * 100)}% of market median $${market.marketMedian.toFixed(2)}`,
    };
  }

  if (
    market.catalogBasePrice > 0 &&
    price < market.catalogBasePrice * 0.25 &&
    market.sampleSize >= MIN_MARKET_SAMPLE
  ) {
    return {
      suspicious: true,
      reason: `price $${price} is far below catalog base $${market.catalogBasePrice}`,
    };
  }

  return { suspicious: false };
}

export function priceCompetitivenessScore(
  price: number,
  market: MarketPriceContext,
): number {
  if (price <= 0) return 0;

  const ref =
    market.marketMedian ??
    (market.catalogBasePrice > 0 ? market.catalogBasePrice : null);
  if (!ref || ref <= 0) return 0.5;

  const ratio = price / ref;
  if (ratio >= 1.15) return 0.15;
  if (ratio >= 1.05) return 0.35;
  if (ratio >= 0.98) return 0.55;
  if (ratio >= 0.9) return 0.75;
  if (ratio >= 0.75) return 0.9;
  return 0.95;
}
