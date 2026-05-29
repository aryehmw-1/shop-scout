import { isGenericCatalogImage } from "../indexing/retailer-page-image";
import { titleSimilarity } from "../catalog/title-similarity";
import type { CatalogItem } from "../retailers/catalog";
import { buildFullSearchQuery } from "../shopping/intent-merge";
import type { ProductOffer, ProductSearchResults, ShoppingIntent } from "../types";
import { isPdpProductUrl, isSearchProductUrl } from "./url-classifier";
import { hasUniqueRetailerImage, isVerifiedOffer } from "./offer-trust";
import { applyOfferImageFallback } from "./offer-image-fallback";
import { syncPriceBadge } from "./offer-pipeline-meta";
import { isDisplayableOffer, showEstimatedOffersInUi } from "./offer-persist-validation";
import { rankOffersByDealScore } from "../pricing/deal-score";

export const DISPLAY_OFFER_LIMIT = 10;
export const DISPLAY_ESTIMATED_LIMIT = 6;

const NON_VERIFIED_SOURCES = new Set([
  "catalog_model",
  "daily_index",
  "nightly_index",
  "cached_quote",
  "historical_model",
]);

export interface OfferRankFactors {
  score: number;
  pdp: boolean;
  verifiedPrice: boolean;
  uniqueImage: boolean;
  penalties: string[];
}

export function computeOfferRankScore(
  offer: ProductOffer,
  catalogTitle?: string,
): OfferRankFactors {
  const penalties: string[] = [];
  let score = (offer.matchConfidence ?? 0.4) * 40;

  if (NON_VERIFIED_SOURCES.has(offer.priceSource ?? "catalog_model")) {
    score -= 80;
    penalties.push("non-verified-source");
  }

  if (isPdpProductUrl(offer.productUrl)) {
    score += 35;
  } else if (isSearchProductUrl(offer.productUrl)) {
    score -= 45;
    penalties.push("search-url");
  } else {
    score -= 20;
    penalties.push("non-pdp-url");
  }

  if (
    offer.priceSource === "scraped" ||
    offer.priceSource === "connector_api"
  ) {
    score += 50;
  } else if (offer.priceSource === "catalog_model") {
    score -= 35;
    penalties.push("catalog-estimate");
  }

  if (hasUniqueRetailerImage(offer)) {
    score += 18;
  } else if (isGenericCatalogImage(offer.imageUrl)) {
    score -= 22;
    penalties.push("generic-image");
  }

  if ((offer.identityConfidence ?? 0) >= 0.95) {
    score += 25;
  } else if ((offer.identityConfidence ?? 0) < 0.5) {
    score -= 12;
    penalties.push("weak-identity");
  }

  if (catalogTitle && offer.storeTitle) {
    const sim = titleSimilarity(catalogTitle, offer.storeTitle);
    if (sim >= 0.5) score += sim * 15;
    else if (sim < 0.35) {
      score -= 10;
      penalties.push("weak-title");
    }
  }

  if (isVerifiedOffer(offer)) score += 40;

  return {
    score: Math.round(score * 10) / 10,
    pdp: isPdpProductUrl(offer.productUrl),
    verifiedPrice: isVerifiedOffer(offer),
    uniqueImage: hasUniqueRetailerImage(offer),
    penalties,
  };
}

export function rankOffersForDisplay(
  offers: ProductOffer[],
  catalogTitle?: string,
): ProductOffer[] {
  const scored = offers.map((o) => ({
    offer: o,
    rank: computeOfferRankScore(o, catalogTitle),
  }));

  scored.sort((a, b) => {
    const av = isVerifiedOffer(a.offer) ? 1 : 0;
    const bv = isVerifiedOffer(b.offer) ? 1 : 0;
    if (bv !== av) return bv - av;
    if (b.rank.score !== a.rank.score) return b.rank.score - a.rank.score;
    return a.offer.landedCost - b.offer.landedCost;
  });

  return scored.map((s) => s.offer);
}

function finalizeOfferRow(
  offer: ProductOffer,
  item?: CatalogItem,
  intent?: ShoppingIntent,
): ProductOffer {
  const q = intent ? buildFullSearchQuery(intent) : undefined;
  return syncPriceBadge(applyOfferImageFallback(offer, item, q));
}

/** Verified and displayable offers only — estimated hidden unless env flag set. */
export function prepareResultsForDisplay(
  results: ProductSearchResults,
  options: { limit?: number; item?: CatalogItem; intent?: ShoppingIntent } = {},
): ProductSearchResults {
  const limit = options.limit ?? DISPLAY_OFFER_LIMIT;
  const estLimit = DISPLAY_ESTIMATED_LIMIT;
  const catalogTitle = results.matchedProduct?.title;
  const merged = rankOffersForDisplay(
    [...results.online, ...results.local],
    catalogTitle,
  );

  const displayableRaw = merged.filter(isDisplayableOffer);
  const rankedDisplayable = rankOffersByDealScore(displayableRaw);
  const verifiedRaw = rankedDisplayable.filter(isVerifiedOffer);
  const estimatedRaw = showEstimatedOffersInUi()
    ? merged.filter((o) => !isDisplayableOffer(o) && !isVerifiedOffer(o))
    : [];

  const verified = verifiedRaw
    .slice(0, limit)
    .map((o) => finalizeOfferRow(o, options.item, options.intent));

  const estimated = estimatedRaw
    .slice(0, estLimit)
    .map((o) => finalizeOfferRow(o, options.item, options.intent));

  const bestId =
    verified.find((o) => o.isBestDeal)?.id ??
    [...verified].sort((a, b) => a.landedCost - b.landedCost)[0]?.id;

  const online = verified.map((o) => ({
    ...o,
    isBestDeal: bestId ? o.id === bestId : false,
    dealLabel:
      bestId && o.id === bestId ? ("best_deal" as const)
      : o.dealLabel ?? ("verified" as const),
  }));

  return {
    ...results,
    local: [],
    online,
    estimatedOnline: estimated,
  };
}

export function rankScoreMap(
  offers: ProductOffer[],
  catalogTitle?: string,
): Map<string, OfferRankFactors> {
  const map = new Map<string, OfferRankFactors>();
  for (const o of offers) {
    map.set(o.id, computeOfferRankScore(o, catalogTitle));
  }
  return map;
}
