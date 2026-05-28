import type { ProductOffer, ProductSearchResults } from "../types";

export function isVerifiedLivePrice(offer: ProductOffer): boolean {
  return (
    offer.priceSource === "connector_api" ||
    offer.priceSource === "cached_quote" ||
    offer.priceSource === "nightly_index"
  );
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

  if (offer.priceSource === "nightly_index") {
    return {
      ...offer,
      priceNote: offer.priceNote ?? "Today’s price · updated overnight",
    };
  }

  if (offer.priceSource === "cached_quote") {
    return {
      ...offer,
      priceNote: offer.priceNote ?? "Recent price · from an earlier search",
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
