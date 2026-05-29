import { isPdpProductUrl } from "../offers/url-classifier";
import { isDisplayableOffer } from "../offers/offer-persist-validation";
import type { ProductOffer } from "../types";
import type { ProductRetailerStats } from "./price-stats-store";
import {
  buildMarketPriceContext,
  isSuspiciouslyLowPrice,
  percentBelowCatalog,
  percentBelowMarket,
  priceCompetitivenessScore,
  type MarketPriceContext,
} from "./market-price";

export interface DealScoreBreakdown {
  dealScore: number;
  priceCompetitiveness: number;
  matchConfidence: number;
  retailerTrust: number;
  imageQuality: number;
  pdpQuality: number;
  historicalReliability: number;
  shippingBonus: number;
  suspicious: boolean;
  suspiciousReason?: string;
}

export interface DealIntelligenceFields {
  dealScore: number;
  dealScoreBreakdown?: DealScoreBreakdown;
  marketMedianPrice?: number;
  marketMeanPrice?: number;
  percentBelowMarket?: number;
  percentBelowCatalog?: number;
  historicalLowPrice?: number;
  movingAvgPrice?: number;
  verificationCount?: number;
  lastVerifiedAt?: string;
  retailerTrustScore?: number;
  isGoodDeal?: boolean;
  isHistoricalLow?: boolean;
  dealLabel?: "best_deal" | "good_deal" | "verified";
}

function statsKey(offer: ProductOffer): string {
  return `${offer.retailer}:${offer.channel}`;
}

function historicalReliabilityScore(
  stats: ProductRetailerStats | undefined,
  price: number,
): number {
  if (!stats || stats.verificationCount < 1) return 0.45;
  let score = Math.min(1, 0.4 + stats.verificationCount * 0.06);
  if (stats.movingAvgPriceUsd && stats.movingAvgPriceUsd > 0) {
    const stability = 1 - Math.min(0.5, Math.abs(price - stats.movingAvgPriceUsd) / stats.movingAvgPriceUsd);
    score = score * 0.7 + stability * 0.3;
  }
  return Math.round(score * 1000) / 1000;
}

export function computeDealScore(
  offer: ProductOffer,
  market: MarketPriceContext,
  retailerTrust: number,
  stats?: ProductRetailerStats,
): DealScoreBreakdown {
  const suspiciousCheck = isSuspiciouslyLowPrice(offer.price, market);

  const priceCompetitiveness = priceCompetitivenessScore(offer.price, market);
  const matchConfidence = Math.min(1, offer.matchConfidence ?? 0.5);
  const imageQuality = Math.min(1, offer.imageConfidence ?? (offer.imageUrl?.startsWith("https://") ? 0.6 : 0.2));
  const pdpQuality = isPdpProductUrl(offer.productUrl) ? 1 : 0.2;
  const historicalReliability = historicalReliabilityScore(stats, offer.price);
  const shippingBonus =
    offer.deliveryFee != null && offer.deliveryFee === 0 ? 0.05
    : offer.deliveryFee != null && offer.deliveryFee > 0 ? -Math.min(0.08, offer.deliveryFee / offer.price / 10)
    : 0;

  const dealScore = suspiciousCheck.suspicious ? 0 : Math.round(
    (
      priceCompetitiveness * 0.35 +
      matchConfidence * 0.2 +
      retailerTrust * 0.15 +
      imageQuality * 0.1 +
      pdpQuality * 0.1 +
      historicalReliability * 0.1 +
      shippingBonus
    ) * 1000,
  ) / 1000;

  return {
    dealScore,
    priceCompetitiveness,
    matchConfidence,
    retailerTrust,
    imageQuality,
    pdpQuality,
    historicalReliability,
    shippingBonus,
    suspicious: suspiciousCheck.suspicious,
    suspiciousReason: suspiciousCheck.reason,
  };
}

export function applyDealIntelligenceToOffer(
  offer: ProductOffer,
  market: MarketPriceContext,
  retailerTrust: number,
  stats?: ProductRetailerStats,
): ProductOffer {
  if (!isDisplayableOffer(offer)) return offer;

  const breakdown = computeDealScore(offer, market, retailerTrust, stats);
  if (breakdown.suspicious) {
    return {
      ...offer,
      pipelineDebug: {
        ...offer.pipelineDebug,
        priceBadge: offer.pipelineDebug?.priceBadge ?? "verified_live",
        source: offer.priceSource ?? "scraped",
        validationStatus: "rejected",
        rejectedReason: "suspicious_price",
        imageFallbackLevel: offer.pipelineDebug?.imageFallbackLevel ?? 5,
        persistRejectionReason: breakdown.suspiciousReason,
      },
      dealScore: 0,
    };
  }

  const pctMarket = percentBelowMarket(offer.price, market.marketMedian);
  const pctCatalog = percentBelowCatalog(offer.price, market.catalogBasePrice);
  const isHistoricalLow =
    stats?.lowestPriceUsd != null && offer.price <= stats.lowestPriceUsd * 1.01;

  let dealLabel: DealIntelligenceFields["dealLabel"] = "verified";
  if (pctMarket != null && pctMarket >= 8) dealLabel = "good_deal";

  const fields: DealIntelligenceFields = {
    dealScore: breakdown.dealScore,
    dealScoreBreakdown: breakdown,
    marketMedianPrice: market.marketMedian ?? undefined,
    marketMeanPrice: market.marketMean ?? undefined,
    percentBelowMarket: pctMarket ?? undefined,
    percentBelowCatalog: pctCatalog ?? undefined,
    historicalLowPrice: stats?.lowestPriceUsd,
    movingAvgPrice: stats?.movingAvgPriceUsd,
    verificationCount: stats?.verificationCount,
    lastVerifiedAt: offer.priceAsOf ?? stats?.lastVerifiedAt?.toISOString(),
    retailerTrustScore: retailerTrust,
    isGoodDeal: (pctMarket ?? 0) >= 5 || (pctCatalog ?? 0) >= 10,
    isHistoricalLow,
    dealLabel,
  };

  return { ...offer, ...fields };
}

export function rankOffersByDealScore(offers: ProductOffer[]): ProductOffer[] {
  return [...offers].sort((a, b) => {
    const ds = (b.dealScore ?? 0) - (a.dealScore ?? 0);
    if (ds !== 0) return ds;
    return a.landedCost - b.landedCost;
  });
}

export function markBestDealByScore(offers: ProductOffer[]): ProductOffer[] {
  const ranked = rankOffersByDealScore(offers.filter((o) => (o.dealScore ?? 0) > 0));
  const bestId = ranked[0]?.id;
  return offers.map((o) => ({
    ...o,
    isBestDeal: bestId ? o.id === bestId : false,
    dealLabel: bestId && o.id === bestId ? "best_deal" as const : o.dealLabel,
  }));
}

export function buildMarketFromOffers(
  offers: ProductOffer[],
  catalogBasePrice: number,
): MarketPriceContext {
  return buildMarketPriceContext(offers, catalogBasePrice);
}

export function statsForOffer(
  offer: ProductOffer,
  statsMap: Map<string, ProductRetailerStats>,
): ProductRetailerStats | undefined {
  return statsMap.get(statsKey(offer));
}
