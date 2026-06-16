import { filterPublicOffers } from "@/lib/retailers/public-retailers";
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
import { isGroceryQuery, GROCERY_CATEGORIES } from "../search/grocery-retrieval";
import { applyDeliveredPricing } from "../pricing/delivered-price";
import { applyOfferFreshness } from "./offer-freshness";
import { rankOffersByDealScore } from "../pricing/deal-score";
import { categoryRankingBoost, inferQueryCategoryFamily } from "../inventory/category-coverage";
import { isExactMatchBand } from "./product-match-analysis";
import {
  passesConsumerTrustGates,
  passesFreshnessVisibilityGate,
  passesRetailerLinkGate,
} from "./consumer-trust";
import { classifyOfferFreshness } from "../pricing/quote-freshness-policy";

export const DISPLAY_OFFER_LIMIT = 5;
export const DISPLAY_ESTIMATED_LIMIT = 5;
export const DISPLAY_LOW_CONFIDENCE_LIMIT = 5;

export function searchDebugUiEnabled(): boolean {
  if (typeof process !== "undefined") {
    const raw = process.env.NEXT_PUBLIC_SEARCH_DEBUG?.trim().toLowerCase();
    if (raw === "1" || raw === "true" || raw === "on") return true;
  }
  return false;
}

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
  categoryId?: string,
): OfferRankFactors {
  const penalties: string[] = [];
  let score = (offer.matchConfidence ?? 0.4) * 40;

  if (categoryId) {
    score += categoryRankingBoost(categoryId) * 100;
  }

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

  if (offer.matchBand === "rejected" || offer.matchBand === "weak") {
    score -= 120;
    penalties.push("weak-match-band");
  } else if (offer.matchBand === "brand_alternative") {
    score -= 55;
    penalties.push("brand-alternative");
  } else if (offer.matchBand === "similar") {
    score -= 25;
    penalties.push("similar-not-exact");
  }

  if ((offer.confidenceReasons ?? []).some((r) => r.code === "match.variety_pack")) {
    score -= 100;
    penalties.push("variety-pack-mismatch");
  }

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
  categoryId?: string,
): ProductOffer[] {
  // Ranking = CHEAPEST REAL PRICE FIRST, within a coarse quality tier. We rank by
  // the trusted item price (offer.price), NOT landed cost — shipping/tax are
  // estimates and must never reorder results. A tier keeps junk (non-verified or
  // search-result URLs that aren't a real buyable price) below real PDP offers,
  // but among genuine offers the cheapest wins.
  const tier = (o: ProductOffer): number => {
    if (!isVerifiedOffer(o)) return 2;
    if (isSearchProductUrl(o.productUrl)) return 1;
    return 0;
  };
  const priceOf = (o: ProductOffer): number =>
    o.price && o.price > 0 ? o.price : o.landedCost || Number.POSITIVE_INFINITY;

  const scored = offers.map((o) => ({ offer: o }));
  scored.sort((a, b) => {
    const t = tier(a.offer) - tier(b.offer);
    if (t !== 0) return t;
    return priceOf(a.offer) - priceOf(b.offer);
  });

  return scored.map((s) => s.offer);
}

function shouldUseClosestMatchFallback(
  intent: ShoppingIntent | undefined,
  item?: CatalogItem,
): boolean {
  if (!intent) return false;
  if (isGroceryQuery(intent.query, intent)) return true;
  if (item && GROCERY_CATEGORIES.has(item.category)) return true;
  return false;
}

function finalizeOfferRow(
  offer: ProductOffer,
  item?: CatalogItem,
  intent?: ShoppingIntent,
): ProductOffer {
  const q = intent ? buildFullSearchQuery(intent) : undefined;
  const withImage = applyOfferImageFallback(offer, item, q);
  const withDelivered = intent ? applyDeliveredPricing(withImage, intent) : withImage;
  return syncPriceBadge(applyOfferFreshness(withDelivered));
}

function tierForOffer(offer: ProductOffer): "exact" | "similar" | "brand" | "other" {
  const band = offer.matchBand;
  if (band === "exact_verified" || band === "likely_match") return "exact";
  if (band === "brand_alternative") return "brand";
  if (band === "similar") return "similar";
  if (isExactMatchBand(band) && passesConsumerTrustGates(offer)) return "exact";
  return "other";
}

/** Relaxed gates for stale-but-visible offers when fresh quotes are unavailable. */
function passesStaleVisibleFallbackGates(offer: ProductOffer): boolean {
  if (offer.matchBand === "rejected" || offer.matchBand === "weak") return false;
  if (!passesFreshnessVisibilityGate(offer)) return false;
  if ((offer.matchConfidence ?? 0) < 0.55) return false;
  if (!offer.price || offer.price <= 0) return false;
  if (!passesRetailerLinkGate(offer)) return false;
  return isVerifiedOffer(offer) || Boolean(offer.verifiedPersistedInventory);
}

/** Verified and displayable offers only — estimated hidden unless env flag set. */
export function prepareResultsForDisplay(
  results: ProductSearchResults,
  options: { limit?: number; item?: CatalogItem; intent?: ShoppingIntent; searchQuery?: string } = {},
): ProductSearchResults {
  const limit = options.limit ?? DISPLAY_OFFER_LIMIT;
  const estLimit = DISPLAY_ESTIMATED_LIMIT;
  const lowLimit = DISPLAY_LOW_CONFIDENCE_LIMIT;
  const catalogTitle = results.matchedProduct?.title;
  const categoryId =
    options.item?.category ?? (options.intent?.category as string | undefined);
  const queryFamily = inferQueryCategoryFamily(
    options.searchQuery ?? options.intent?.query,
  );
  const merged = rankOffersForDisplay(
    filterPublicOffers([...results.online, ...results.local]),
    catalogTitle,
    categoryId,
  );

  const displayableRaw = merged.filter(isDisplayableOffer);
  const rankedDisplayable = rankOffersByDealScore(displayableRaw);
  const consumerVerified = rankedDisplayable.filter(passesConsumerTrustGates);
  const staleVisibleFallback =
    consumerVerified.length === 0 ?
      rankedDisplayable.filter(passesStaleVisibleFallbackGates)
    : [];
  const exactTier = consumerVerified.filter((o) => tierForOffer(o) === "exact");
  const similarTier = consumerVerified.filter((o) => tierForOffer(o) === "similar");
  const brandTier = consumerVerified.filter((o) => tierForOffer(o) === "brand");
  const verifiedSource =
    consumerVerified.length > 0 ? consumerVerified
    : staleVisibleFallback.length > 0 ? staleVisibleFallback
    : rankedDisplayable.filter(isVerifiedOffer);
  const verifiedRaw =
    exactTier.length > 0 ? exactTier : verifiedSource.length > 0 ? verifiedSource : rankedDisplayable.filter(isVerifiedOffer);
  const noExactMatchFound =
    exactTier.length === 0 &&
    consumerVerified.length > 0 &&
    (similarTier.length > 0 || brandTier.length > 0);
  const estimatedRaw = showEstimatedOffersInUi()
    ? merged.filter((o) => !isDisplayableOffer(o) && !isVerifiedOffer(o))
    : [];

  const showLowForApparel = queryFamily === "apparel";
  const lowConfidenceRaw =
    searchDebugUiEnabled() || showEstimatedOffersInUi() || showLowForApparel ?
      merged.filter((o) => !isVerifiedOffer(o) && (o.matchConfidence ?? 0) >= 0.35)
    : [];

  // CHEAPEST-FIRST: always order valid matches by real item price ascending, and
  // sort BEFORE slicing so the cheapest valid offers are the ones we keep — never
  // hide a cheaper valid match behind a higher-priced (but higher deal-score) one.
  const priceAsc = (a: ProductOffer, b: ProductOffer) => {
    const ap = a.price && a.price > 0 ? a.price : a.landedCost || Number.POSITIVE_INFINITY;
    const bp = b.price && b.price > 0 ? b.price : b.landedCost || Number.POSITIVE_INFINITY;
    return ap - bp;
  };

  const verified = [...verifiedRaw]
    .sort(priceAsc)
    .slice(0, limit)
    .map((o) => finalizeOfferRow(o, options.item, options.intent));

  const groceryClosest =
    verified.length === 0 &&
    shouldUseClosestMatchFallback(options.intent, options.item) ?
      merged
        .filter(
          (o) =>
            o.priceSource === "catalog_model" &&
            o.price > 0 &&
            o.productUrl?.startsWith("http"),
        )
        .sort(priceAsc)
        .slice(0, limit)
        .map((o) =>
          finalizeOfferRow(
            {
              ...o,
              dealLabel: "closest_match",
              priceNote: o.priceNote ?? "Estimated · closest catalog match",
              matchConfidence: o.matchConfidence ?? 0.62,
            },
            options.item,
            options.intent,
          ),
        )
    : [];

  const displayVerified = verified.length > 0 ? verified : groceryClosest;

  const estimated = estimatedRaw
    .slice(0, estLimit)
    .map((o) => finalizeOfferRow(o, options.item, options.intent));

  const lowConfidence = lowConfidenceRaw
    .filter((o) => !estimatedRaw.some((e) => e.id === o.id))
    .slice(0, lowLimit)
    .map((o) => finalizeOfferRow(o, options.item, options.intent));

  // "Best" = cheapest REAL item price (not landed cost — shipping/tax estimated).
  const bestPrice = (o: ProductOffer) =>
    o.price && o.price > 0 ? o.price : o.landedCost || Number.POSITIVE_INFINITY;
  const bestId = [...displayVerified].sort((a, b) => bestPrice(a) - bestPrice(b))[0]?.id;

  const online = displayVerified.map((o) => ({
    ...o,
    isBestDeal: bestId ? o.id === bestId : false,
    dealLabel:
      bestId && o.id === bestId ? ("best_deal" as const)
      : o.dealLabel ?? ("verified" as const),
  }));

  const staleCount = online.filter((o) => {
    const t = classifyOfferFreshness(o).tier;
    return t === "stale_visible" || t === "expired";
  }).length;
  const catalogFreshnessWarning =
    online.length > 0 && staleCount / online.length >= 0.5 ?
      {
        staleCount,
        totalCount: online.length,
        message: `${staleCount} of ${online.length} prices may be outdated — verify at retailer before purchase.`,
      }
    : staleVisibleFallback.length > 0 && consumerVerified.length === 0 ?
      {
        staleCount: staleVisibleFallback.length,
        totalCount: staleVisibleFallback.length,
        message: "Showing last known prices — refresh in progress. Verify at retailer checkout.",
      }
    : undefined;

  return {
    ...results,
    local: [],
    online,
    estimatedOnline: estimated,
    lowConfidenceOnline: lowConfidence.length ? lowConfidence : undefined,
    catalogFreshnessWarning,
    noExactMatchFound:
      verified.length === 0 && groceryClosest.length > 0 ?
        true
      : noExactMatchFound,
    closestMatchFallback: groceryClosest.length > 0,
    matchTiers: {
      exact: exactTier.slice(0, limit).map((o) => finalizeOfferRow(o, options.item, options.intent)),
      similar: similarTier.slice(0, lowLimit).map((o) => finalizeOfferRow(o, options.item, options.intent)),
      brandAlternatives: brandTier.slice(0, lowLimit).map((o) => finalizeOfferRow(o, options.item, options.intent)),
    },
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
