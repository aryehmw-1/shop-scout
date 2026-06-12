// Exact-match vs similar-alternative card assembly.
//
// Rules (do NOT force exact matches that don't exist):
//   • EXACT offers are retailer offers for the SAME canonical product — they are
//     only ever grouped together when the pipeline proved identity (UPC/GTIN/EAN,
//     exact model number, or brand + size/count/color). Mere similarity NEVER
//     groups products as exact. (That proof lives in src/lib/pipeline/match.ts;
//     by the time offers reach here they are already same-product.)
//   • The cheapest EXACT offer gets the "Best" badge.
//   • SIMILAR products are different items shown as clearly-labelled alternatives.
//     They never compete for "Best" and are never part of price comparison.
//   • Up to 7 cards: up to 5 exact, then fill the rest with similar. If there are
//     fewer than 5 exact, similar fills the remaining slots. If there are 0 exact,
//     show only similar.

import type { ProductOffer } from "../types";

export type ResultCardKind = "exact" | "similar";

export interface ResultCard {
  kind: ResultCardKind;
  offer: ProductOffer;
  /** Only an exact card can be the best price. */
  isBest: boolean;
  /** Stable label for the UI badge. */
  badge: "best" | "exact" | "similar";
}

export interface AssembleOptions {
  maxCards?: number;
  maxExact?: number;
  /** Natural number of similar cards when exact matches fill their quota. */
  similarQuota?: number;
}

/** Delivered price for ranking (delivered total → landed → list). */
export function offerPrice(o: ProductOffer): number {
  return o.deliveredTotal ?? o.landedCost ?? o.price ?? Number.POSITIVE_INFINITY;
}

/**
 * Assemble the ordered card list from EXACT offers (same product, different
 * sellers) and SIMILAR offers (best offer per alternative product). Pure +
 * deterministic.
 */
export function assembleResultCards(
  exactOffers: ProductOffer[],
  similarOffers: ProductOffer[],
  opts: AssembleOptions = {},
): ResultCard[] {
  const maxCards = opts.maxCards ?? 7;
  const maxExact = opts.maxExact ?? 5;
  const similarQuota = opts.similarQuota ?? 2;

  // Exact: cheapest first, capped at maxExact. Cheapest is "Best".
  const exact = [...exactOffers]
    .sort((a, b) => offerPrice(a) - offerPrice(b))
    .slice(0, maxExact);
  const exactCards: ResultCard[] = exact.map((offer, i) => ({
    kind: "exact",
    offer,
    isBest: i === 0,
    badge: i === 0 ? "best" : "exact",
  }));

  // Similar fills the remaining space. When exact fills its quota we show the
  // natural similarQuota; when exact is short, similar expands to fill 7.
  const slotsLeft = Math.max(0, maxCards - exactCards.length);
  const similarCount =
    exactCards.length >= maxExact
      ? Math.min(similarQuota, slotsLeft, similarOffers.length)
      : Math.min(slotsLeft, similarOffers.length);

  const similarCards: ResultCard[] = similarOffers.slice(0, similarCount).map((offer) => ({
    kind: "similar",
    offer,
    isBest: false,
    badge: "similar",
  }));

  return [...exactCards, ...similarCards];
}

/** Convenience: the offers that participate in price comparison (exact only). */
export function comparableOffers(cards: ResultCard[]): ProductOffer[] {
  return cards.filter((c) => c.kind === "exact").map((c) => c.offer);
}
