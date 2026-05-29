import type { ProductOffer } from "../types";

export function formatLastVerified(offer: ProductOffer): string | undefined {
  const ts = offer.lastVerifiedAt ?? offer.priceAsOf;
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
