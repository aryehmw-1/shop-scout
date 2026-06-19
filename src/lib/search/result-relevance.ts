import type { ProductOffer } from "../types";
import { sharesContentWord, baseTokens, isIncidentalMention } from "./query-understanding";

/**
 * Final relevance/sanity gates applied to displayed offers — the safety net that
 * stops embarrassing results when a no-match fallback surfaces a default catalog
 * product (e.g. a "Spring Mix Salad" for "office chair"), or a provider returns
 * an accessory/part priced like a fraction of the real product.
 */

/** Accessory / spare-part words. If an offer's title carries one of these and the
 *  query did NOT ask for it, the offer is a part/accessory, not the product. */
const ACCESSORY_WORDS = new Set([
  "replacement", "cover", "covers", "cushion", "cushions", "wheel", "wheels",
  "caster", "casters", "mat", "parts", "part", "shade", "shades", "filter",
  "filters", "bulb", "bulbs", "cleaner", "cleaners", "shelf", "shelves", "leg",
  "legs", "armrest", "screw", "screws", "bracket", "sticker", "decal", "skin",
  "strap", "manual", "refill", "refills",
  // Microwave / fridge / appliance accessories — never the appliance itself.
  "tray", "trays", "turntable", "plate", "plates", "liner", "liners", "rack",
  "racks", "splatter", "steamer", "knob", "knobs", "handle", "handles", "gasket",
  "vent", "grease",
]);

/** Toy / novelty / miniature words — a toy chair is not an office chair. */
const NOVELTY_WORDS = new Set([
  "toy", "toys", "miniature", "dollhouse", "doll", "keychain", "ornament",
  "figurine", "diorama",
]);

function offerText(o: ProductOffer): string {
  return `${o.brand ?? ""} ${o.storeTitle ?? o.title ?? ""}`.trim();
}

/** Does this offer share any content word (synonym-aware) with the query, or with
 *  the confidently-matched product? Zero overlap ⇒ it's the wrong product. */
export function offerMatchesQuery(
  query: string,
  offer: ProductOffer,
  matchedTitle?: string,
): boolean {
  if (!query.trim()) return true;
  if (sharesContentWord(query, offerText(offer))) return true;
  if (matchedTitle && sharesContentWord(query, matchedTitle)) return true;
  return false;
}

/** Query types for which "cleaner" is the real appliance HEAD, not an accessory:
 *  a "vacuum cleaner" IS a vacuum, but a "refrigerator cleaner" (spray) is not a
 *  refrigerator. So "cleaner" only counts as junk for non-cleaning queries. */
const CLEANER_APPLIANCE = new Set([
  "vacuum", "carpet", "steam", "steamer", "pressure", "floor", "window", "tile",
  "upholstery", "pool",
]);

/** An accessory/part/novelty when the user asked for the real product. */
export function looksLikeAccessoryMismatch(query: string, offer: ProductOffer): boolean {
  const q = new Set(baseTokens(query));
  const cleanerIsAppliance = [...q].some((t) => CLEANER_APPLIANCE.has(t));
  const tokens = baseTokens(offerText(offer));
  return tokens.some((t) => {
    if ((t === "cleaner" || t === "cleaners") && cleanerIsAppliance) return false;
    return (ACCESSORY_WORDS.has(t) || NOVELTY_WORDS.has(t)) && !q.has(t);
  });
}

/** Distinct product head-nouns. If a single-word TYPE query (e.g. "desk") is used
 *  as a MODIFIER of one of these in the title ("desk LAMP"), the offer is a
 *  different product and should be rejected. Compound names where the query is
 *  followed by a generic container word ("microwave OVEN", "vacuum CLEANER") are
 *  NOT here, so they stay. */
const DISTINCT_HEAD_NOUNS = new Set([
  "lamp", "shade", "chair", "table", "shelf", "stand", "rack", "holder", "mat",
  "pad", "cover", "case", "light", "bulb", "filter", "fan", "cushion", "organizer",
  "riser", "tray", "sleeve", "mount", "bracket", "topper", "protector", "skirt",
  // Microwavable / food heads — "microwave popcorn", "microwave meal" use the
  // appliance word as an adjective; the product is the food, not a microwave.
  "popcorn", "meal", "meals", "dinner", "dinners", "rice", "oatmeal", "soup",
  "noodles", "pasta",
]);

/**
 * For a SINGLE-word product-type query, reject offers that use the query word as a
 * MODIFIER of a different product ("desk" → "Desk Lamp", "refrigerator" →
 * "Refrigerator Light Bulb", "lamp" → "Lamp Shade"). Only fires when the query
 * word is immediately followed by a distinct head-noun — so "Computer Desk",
 * "Floor Lamp", and "Microwave Oven" are unaffected.
 */
export function isTypeModifierMismatch(query: string, offer: ProductOffer): boolean {
  const qTokens = baseTokens(query);
  if (qTokens.length !== 1) return false;
  const q = qTokens[0];
  const tokens = baseTokens(offerText(offer));
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] !== q) continue;
    const next = tokens[i + 1];
    if (next !== q && DISTINCT_HEAD_NOUNS.has(next)) return true;
  }
  return false;
}

const realPrice = (o: ProductOffer): number =>
  o.price && o.price > 0 ? o.price : o.landedCost ?? 0;

/** Does a single offer survive ALL the per-offer display gates (everything except
 *  the multi-offer price-outlier guard)? The single source of truth shared by the
 *  display filter and the catalog resolver, so the resolver never commits to a
 *  product the display would then drop. */
function offerPassesGates(query: string, offer: ProductOffer, matchedTitle?: string): boolean {
  return (
    offerMatchesQuery(query, offer, matchedTitle) &&
    !looksLikeAccessoryMismatch(query, offer) &&
    !isTypeModifierMismatch(query, offer) &&
    !isIncidentalMention(query, offerText(offer))
  );
}

/**
 * Title-level version of the display gates, for the catalog resolver: would a
 * product with this title (and brand) survive the per-offer relevance gates for
 * the query? Lets the resolver SKIP a top text-match that the display layer would
 * only reject — e.g. "dish soap" → "365 … Dish Soap REFILL" (accessory) — and keep
 * looking for a product that actually shows.
 */
export function titleIsRelevant(
  query: string | undefined,
  title: string,
  brand?: string,
  matchedTitle?: string,
): boolean {
  if (!query?.trim() || !title?.trim()) return true;
  const offer = { brand: brand ?? "", storeTitle: title } as unknown as ProductOffer;
  return offerPassesGates(query, offer, matchedTitle);
}

/**
 * Apply the relevance + sanity gates to a set of offers for a query:
 *   1. drop offers that share NO content word with the query/matched product,
 *   2. drop accessory/part/novelty offers the user didn't ask for,
 *   3. drop absurd LOW price outliers (< median/5) once there's a baseline — a
 *      $3 item among $40 chairs is a fragment/accessory, not the answer.
 * Conservative: never empties a set that has ≥1 relevant priced offer.
 */
export function filterRelevantOffers(
  offers: ProductOffer[],
  query: string | undefined,
  matchedTitle?: string,
): ProductOffer[] {
  if (!query?.trim() || offers.length === 0) return offers;

  let kept = offers.filter((o) => offerPassesGates(query, o, matchedTitle));
  if (kept.length === 0) return kept; // nothing relevant → request-form path

  // LOW price-outlier guard: only with enough of a baseline to trust the median.
  const priced = kept.map(realPrice).filter((p) => p > 0).sort((a, b) => a - b);
  if (priced.length >= 3) {
    const median = priced[Math.floor(priced.length / 2)];
    const floor = median / 5;
    const filtered = kept.filter((o) => realPrice(o) === 0 || realPrice(o) >= floor);
    if (filtered.length) kept = filtered;
  }
  return kept;
}
