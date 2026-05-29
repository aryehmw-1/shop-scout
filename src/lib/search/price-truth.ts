import { MIN_TRUSTED_MATCH_CONFIDENCE } from "../offers/offer-quality";
import { isPdpProductUrl } from "../offers/url-classifier";
import type { ProductOffer, ProductSearchResults } from "../types";

export function isVerifiedLivePrice(offer: ProductOffer): boolean {
  if ((offer.matchConfidence ?? 0) < MIN_TRUSTED_MATCH_CONFIDENCE) return false;

  if (offer.priceSource === "connector_api" || offer.priceSource === "scraped") {
    return true;
  }

  return false;
}

export function isHistoricalModelPrice(offer: ProductOffer): boolean {
  return offer.priceSource === "historical_model";
}

/** Sort: verified live prices first (cheapest first), then unverified. */
export function sortOffersByPriceTruth(offers: ProductOffer[]): ProductOffer[] {
  const live = offers
    .filter(isVerifiedLivePrice)
    .sort((a, b) => a.landedCost - b.landedCost);
  const other = offers
    .filter((o) => !isVerifiedLivePrice(o))
    .sort((a, b) => a.landedCost - b.landedCost);
  return [...live, ...other];
}

export function markBestDealWithPriceTruth(offers: ProductOffer[]): ProductOffer[] {
  const sorted = sortOffersByPriceTruth(offers);
  const bestLiveIndex = sorted.findIndex(isVerifiedLivePrice);
  const bestIndex = bestLiveIndex >= 0 ? bestLiveIndex : 0;

  return sorted.map((o, i) => ({
    ...o,
    isBestDeal: i === bestIndex,
  }));
}

function annotateOfferPrice(offer: ProductOffer): ProductOffer {
  if (offer.priceSource === "connector_api") {
    const note =
      offer.retailer === "amazon" ?
        "Live price · Amazon"
      : "Live price · verified";
    return {
      ...offer,
      priceNote: offer.priceNote ?? note,
    };
  }

  if (offer.priceSource === "scraped") {
    return {
      ...offer,
      priceNote: offer.priceNote ?? "Price from retailer page · verify at checkout",
    };
  }

  if (
    offer.priceSource === "nightly_index" ||
    offer.priceSource === "daily_index"
  ) {
    return {
      ...offer,
      priceNote: offer.priceNote ?? "From daily index · verify at store",
    };
  }

  if (offer.priceSource === "cached_quote") {
    return {
      ...offer,
      priceNote: offer.priceNote ?? "From our database · last daily check",
    };
  }

  if (offer.priceSource === "historical_model") {
    return {
      ...offer,
      priceNote: offer.priceNote ?? "30-day average · from our daily checks",
    };
  }

  return {
    ...offer,
    priceSource: "catalog_model",
    priceNote: "Estimated price · verify at store",
  };
}

/** Label prices honestly and rank verified deals first. */
export function finalizeSearchPrices(
  results: ProductSearchResults,
): ProductSearchResults {
  const local = markBestDealWithPriceTruth(
    results.local.map((o) => annotateOfferPrice(o)),
  );
  const online = markBestDealWithPriceTruth(
    results.online.map((o) => annotateOfferPrice(o)),
  );

  return { ...results, local, online };
}

export function cheapestVerifiedPrice(
  results: ProductSearchResults,
): number | undefined {
  const all = [...results.local, ...results.online].filter(isVerifiedLivePrice);
  if (!all.length) return undefined;
  return Math.min(...all.map((o) => o.landedCost));
}
