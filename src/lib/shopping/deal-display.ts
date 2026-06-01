import type { ProductOffer } from "../types";
import { classifyOfferFreshness } from "../pricing/quote-freshness-policy";

export function formatLastVerified(offer: ProductOffer): string | undefined {
  const meta = classifyOfferFreshness(offer);
  if (meta.tier === "stale_visible" || meta.tier === "expired") {
    return meta.displayLabel;
  }
  const ts = offer.lastUpdatedAt ?? offer.lastVerifiedAt ?? offer.priceAsOf;
  if (!ts) return undefined;
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "Verified just now";
  if (mins < 60) return `Verified ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `Verified ${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `Verified ${days}d ago`;
}

export function formatVerificationCount(offer: ProductOffer): string | undefined {
  if (!offer.verificationCount || offer.verificationCount < 2) return undefined;
  return `Verified ${offer.verificationCount}×`;
}

export function formatDealScoreLabel(offer: ProductOffer): string | undefined {
  if (offer.dealLabel === "best_deal") return "Best Deal";
  if (offer.isHistoricalLow) return "Historical low";
  if (offer.percentBelowMarket != null && offer.percentBelowMarket >= 5) {
    return `${offer.percentBelowMarket}% below market`;
  }
  return undefined;
}
