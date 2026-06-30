/**
 * Merge/refine shopping intent across conversational turns.
 * Transition decisions live in intent-transition.ts (conservative merge).
 */

import { extractIntentFromMessage } from "../ai/extract-intent";
import { areProductTypesCompatible, parseQueryAttributes } from "../retailers/search";
import { parseBrandFromText } from "./brands";
import { parseMaxPriceFromText } from "./budget";
import { stripShoppingPrefixes } from "./query";
import { parseSizeFromText, sizeAppearsInText } from "./sizes";
import type { SessionState, ShoppingIntent } from "../types";
import {
  classifyIntentTransition,
  isAttributeOnlyFollowUp,
  isExplicitNewSearch,
} from "./intent-transition";

export {
  classifyIntentTransition,
  isExplicitNewSearch,
  computeTokenOverlap,
  inferProductTaxonomy,
  type IntentTransitionAction,
  type IntentTransitionDecision,
} from "./intent-transition";

/** @deprecated Use classifyIntentTransition */
export function isProductTypeSwitch(previousQuery: string, message: string): boolean {
  const prev = parseQueryAttributes(previousQuery).productTypes;
  const next = parseQueryAttributes(stripShoppingPrefixes(message.trim())).productTypes;
  if (!prev.length || !next.length) return false;
  return !areProductTypesCompatible(prev, next);
}

/** Short follow-up that only adds color, size, brand, product subtype, etc. */
export function isAttributeFollowUp(message: string, previousQuery: string): boolean {
  if (!previousQuery.trim()) return false;
  if (isAttributeOnlyFollowUp(message)) return true;

  const msg = stripShoppingPrefixes(message.trim());
  const prevTypes = parseQueryAttributes(previousQuery).productTypes;
  const nextTypes = parseQueryAttributes(msg).productTypes;

  if (
    nextTypes.length > 0 &&
    prevTypes.length > 0 &&
    msg.split(/\s+/).length <= 4 &&
    areProductTypesCompatible(prevTypes, nextTypes)
  ) {
    return true;
  }

  return false;
}

/** Follow-up that narrows the last search (color, brand, size, same product type). */
export function isRefinementMessage(text: string, session: SessionState): boolean {
  if (session.phase !== "ready" || !session.intent?.query?.trim()) return false;
  return classifyIntentTransition(session.intent.query, text, session).shouldMerge;
}

/** Keep refining the active search across multiple chat turns. */
export function shouldMergeWithPreviousSearch(
  text: string,
  session: SessionState,
): boolean {
  if (session.phase !== "ready" || !session.intent?.query?.trim()) return false;
  if (isExplicitNewSearch(text)) return false;
  return classifyIntentTransition(session.intent.query, text, session).shouldMerge;
}

export function mergeSearchIntent(
  previous: Partial<ShoppingIntent>,
  message: string,
): Partial<ShoppingIntent> {
  const msg = stripShoppingPrefixes(message.trim());
  const decision = classifyIntentTransition(previous.query ?? "", message, {
    phase: "ready",
    intent: previous,
    asked: [],
    compareMode: false,
  });

  if (!decision.shouldMerge) {
    const fresh = extractIntentFromMessage(msg, previous.zipCode);
    return {
      query: fresh.query || msg,
      category: fresh.category,
      gender: fresh.gender,
      ageGroup: fresh.ageGroup,
      productSubtype: fresh.productSubtype,
      brand: fresh.brand,
      colors: fresh.colors,
      size: parseSizeFromText(msg) ?? fresh.size,
      maxPrice: parseMaxPriceFromText(msg) ?? fresh.maxPrice,
      zipCode: previous.zipCode,
      organic: fresh.organic,
      retailerPreference: fresh.retailerPreference,
    };
  }

  const attrs = parseQueryAttributes(msg);
  const brand = parseBrandFromText(msg) ?? previous.brand;
  const size = parseSizeFromText(msg) ?? previous.size;
  const maxPrice = parseMaxPriceFromText(msg) ?? previous.maxPrice;
  const prevColors =
    previous.colors ?? parseQueryAttributes(previous.query ?? "").colors;
  const colors = [...new Set([...prevColors, ...attrs.colors])];

  let query = (previous.query ?? "").trim();
  if (!query) query = msg;

  for (const c of attrs.colors) {
    if (!new RegExp(`\\b${c}\\b`, "i").test(query)) query = `${query} ${c}`.trim();
  }
  if (brand && !query.toLowerCase().includes(brand.toLowerCase().split(" ")[0]!)) {
    query = `${brand} ${query}`.trim();
  }
  if (size && !sizeAppearsInText(query, size)) {
    query = `${query} ${size}`.trim();
  }

  const fresh = extractIntentFromMessage(msg, previous.zipCode);
  const gender = attrs.gender ?? fresh.gender ?? previous.gender;
  const ageGroup = attrs.ageGroup ?? fresh.ageGroup ?? previous.ageGroup;
  const category = fresh.category ?? previous.category;
  const subtype = fresh.productSubtype ?? previous.productSubtype;

  if (
    attrs.productTypes.length > 0 &&
    areProductTypesCompatible(
      parseQueryAttributes(previous.query ?? "").productTypes,
      attrs.productTypes,
    )
  ) {
    for (const pt of attrs.productTypes) {
      const label = pt.replace(/_/g, " ");
      if (!query.toLowerCase().includes(label)) {
        query = `${query} ${label}`.trim();
      }
    }
  }

  return {
    ...previous,
    query,
    brand,
    size,
    maxPrice,
    colors: colors.length ? colors : undefined,
    gender,
    ageGroup,
    category,
    productSubtype: subtype,
    zipCode: previous.zipCode,
    // Carry a retailer constraint stated mid-conversation ("only Amazon") so the
    // refined search actually honors it instead of silently dropping it.
    retailerPreference: fresh.retailerPreference ?? previous.retailerPreference,
  };
}

export function buildFullSearchQuery(intent: ShoppingIntent): string {
  const parts: string[] = [];
  if (intent.brand) parts.push(intent.brand);
  if (
    intent.productSubtype &&
    !intent.query.toLowerCase().includes(intent.productSubtype.replace(/_/g, " "))
  ) {
    parts.push(intent.productSubtype.replace(/_/g, " "));
  }
  parts.push(intent.query);
  for (const c of intent.colors ?? []) {
    if (!intent.query.toLowerCase().includes(c)) parts.push(c);
  }
  if (intent.size && !sizeAppearsInText(intent.query, intent.size)) {
    parts.push(intent.size);
  }
  if (intent.gender === "mens" && !/\bmens?\b/i.test(intent.query)) parts.push("mens");
  if (intent.gender === "womens" && !/\bwomens?\b/i.test(intent.query))
    parts.push("womens");
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
