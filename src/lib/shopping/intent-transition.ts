/**
 * Conversational intent transition — refine vs replace vs ambiguous.
 * Prefer trust over aggressive memory: when uncertain, start fresh.
 */

import { extractIntentFromMessage } from "../ai/extract-intent";
import {
  areProductTypesCompatible,
  parseQueryAttributes,
} from "../retailers/search";
import {
  inferQueryCategoryFamily,
  type QueryCategoryFamily,
} from "../inventory/category-coverage";
import { parseBrandFromText } from "./brands";
import { isPriceConstraintFollowUp } from "./budget";
import { looksLikeShoppingQuery, stripShoppingPrefixes } from "./query";
import {
  isSizeOnlyFollowUp,
  parseSizeFromText,
} from "./sizes";
import type { SessionState } from "../types";

export type IntentTransitionAction =
  | "refine_current"
  | "replace_current"
  | "ambiguous"
  | "unrelated";

export interface IntentTransitionDecision {
  action: IntentTransitionAction;
  shouldMerge: boolean;
  confidence: number;
  reason: string;
  priorQuery?: string;
  currentQuery: string;
  priorCategoryFamily?: QueryCategoryFamily;
  nextCategoryFamily?: QueryCategoryFamily;
  priorCategory?: string;
  nextCategory?: string;
  tokenOverlap: number;
  taxonomyOverlap: number;
  priorTaxonomy: string[];
  nextTaxonomy: string[];
}

const REFINE_PREFIX =
  /^(?:in|only|just|make it|show me|i want(?:\s+it)?\s+in|with|in the|the)\b/i;

const COLOR_WORD =
  /^(black|white|navy|blue|red|green|gray|grey|brown|pink|purple|beige|tan|orange|yellow|olive|burgundy|maroon|teal|cream|charcoal)$/i;

const STOP_WORDS = new Set([
  "find",
  "get",
  "buy",
  "need",
  "want",
  "show",
  "the",
  "for",
  "and",
  "with",
  "organic",
  "fresh",
  "whole",
  "ground",
  "blend",
  "breakfast",
  "large",
  "small",
]);

/** Product taxonomy buckets — incompatible groups trigger replacement. */
const TAXONOMY: Record<string, RegExp> = {
  apparel_bottom:
    /\b(pants|joggers?|jeans|chinos|trousers|shorts|leggings|sweatpants)\b/i,
  apparel_top:
    /\b(hoodie|hoody|shirt|sweater|cardigan|polo|jacket|coat|blouse)\b/i,
  footwear: /\b(sneakers?|shoes?|boots?|sandals?|running shoes?|trainers?)\b/i,
  snack: /\b(chips?|pretzels?|crackers?|popcorn|snacks?)\b/i,
  beverage: /\b(coffee|espresso|folgers|maxwell|starbucks|juice|soda|tea)\b/i,
  dairy: /\b(milk|yogurt|cheese|butter|eggs?|dairy)\b/i,
  cereal: /\b(cereal|cheerios|frosted flakes|granola)\b/i,
  household: /\b(paper towels?|towels?|tissue|detergent|soap|cleaner)\b/i,
  pasta_pantry: /\b(pasta|spaghetti|rice|noodles?)\b/i,
  produce: /\b(spinach|salad|greens|lettuce|banana|produce|fruit)\b/i,
  meat: /\b(chicken|beef|pork|fish|salmon|meat)\b/i,
  bedding: /\b(mattress|pillow|sheets?|comforter|duvet|bedding)\b/i,
  electronics:
    /\b(laptop|macbook|computer|tablet|phone|iphone|tv|tvs|television|monitor|headphones?|earbuds?|airpods?|speaker|camera|console|xbox|playstation|ps5)\b/i,
  appliance:
    /\b(refrigerator|fridge|freezer|microwave|dishwasher|washer|dryer|oven|stove|range|blender|vacuum|air fryer|toaster|coffee maker|kettle)\b/i,
  baby: /\b(diapers?|wipes|formula|pacifier|stroller|onesie)\b/i,
  lighting: /\b(lamp|lamps|light bulb|lighting|chandelier|sconce)\b/i,
  furniture: /\b(sofa|couch|loveseat|sectional|armchair|desk|dresser|nightstand|bookcase|wardrobe)\b/i,
};

const APPAREL_TAXONOMY = new Set(["apparel_bottom", "apparel_top", "footwear"]);

function significantTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ""))
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
  );
}

export function computeTokenOverlap(previous: string, message: string): number {
  const a = significantTokens(previous);
  const b = significantTokens(message);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / Math.min(a.size, b.size);
}

export function inferProductTaxonomy(query: string): Set<string> {
  const groups = new Set<string>();
  const lower = query.toLowerCase();
  for (const [group, re] of Object.entries(TAXONOMY)) {
    if (re.test(lower)) groups.add(group);
  }
  const types = parseQueryAttributes(query).productTypes;
  for (const t of types) {
    for (const [group, re] of Object.entries(TAXONOMY)) {
      if (re.test(t)) groups.add(group);
    }
  }
  return groups;
}

function taxonomyOverlap(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  for (const g of a) if (b.has(g)) return true;
  return false;
}

function categoryFamilyFromIntent(
  query: string,
  category?: string,
): QueryCategoryFamily {
  if (category) {
    if (category === "clothing" || category === "shoes") return "apparel";
    if (
      [
        "pantry",
        "dairy",
        "salad",
        "bakery",
        "produce",
        "meat",
        "household",
      ].includes(category)
    ) {
      return "grocery";
    }
    if (category === "bedding" || category === "home") return "home";
  }
  return inferQueryCategoryFamily(query);
}

export function isExplicitNewSearch(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return (
    /^(?:new search|something else|different product|forget (?:that|this|it)|start over|search for something else|nevermind|never mind)\b/.test(
      lower,
    ) ||
    /^(?:actually|instead),?\s+(?:find|search|show|get|i want|i need)\b/i.test(
      text,
    )
  );
}

/** Size, color, brand, price-only — never a new product search. */
export function isAttributeOnlyFollowUp(message: string): boolean {
  const msg = stripShoppingPrefixes(message.trim());
  const lower = msg.toLowerCase();
  if (!msg) return false;

  const nextTypes = parseQueryAttributes(msg).productTypes;
  const nextTax = inferProductTaxonomy(msg);
  if (nextTypes.length > 0 || nextTax.size > 0) return false;

  if (parseSizeFromText(msg)) return true;
  if (isPriceConstraintFollowUp(msg)) return true;
  if (REFINE_PREFIX.test(lower)) return true;
  if (/^(in|with|only|make it|size|under|below|less than)\b/i.test(lower))
    return true;
  if (COLOR_WORD.test(lower.split(/\s+/)[0] ?? "")) return true;
  if (/^(large|medium|small|xl|xxl|xs|xx?s|xx?l)\b/i.test(lower)) return true;

  const words = msg.split(/\s+/).filter(Boolean);
  if (words.length === 1 && parseBrandFromText(msg)) return true;
  if (words.length <= 2 && parseQueryAttributes(msg).colors.length > 0) return true;

  return false;
}

function isApparelSubtypeRefinement(previous: string, message: string): boolean {
  const prevTypes = parseQueryAttributes(previous).productTypes;
  const nextTypes = parseQueryAttributes(stripShoppingPrefixes(message)).productTypes;
  if (!prevTypes.length || !nextTypes.length) return false;
  if (!areProductTypesCompatible(prevTypes, nextTypes)) return false;
  const msg = stripShoppingPrefixes(message.trim());
  return msg.split(/\s+/).length <= 4;
}

function isStandaloneProductQuery(message: string): boolean {
  const msg = stripShoppingPrefixes(message.trim());
  if (!msg || isAttributeOnlyFollowUp(msg)) return false;
  if (!looksLikeShoppingQuery(msg) && msg.split(/\s+/).length < 2) return false;
  const words = msg.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return true;
  const tax = inferProductTaxonomy(msg);
  return tax.size > 0 || parseQueryAttributes(msg).productTypes.length > 0;
}

/**
 * Classify whether the new message refines or replaces the active search intent.
 */
export function classifyIntentTransition(
  previousQuery: string,
  message: string,
  session?: SessionState,
): IntentTransitionDecision {
  const msg = stripShoppingPrefixes(message.trim());
  const prev = (previousQuery ?? session?.intent?.query ?? "").trim();

  const base: Pick<
    IntentTransitionDecision,
    | "priorQuery"
    | "currentQuery"
    | "tokenOverlap"
    | "taxonomyOverlap"
    | "priorTaxonomy"
    | "nextTaxonomy"
    | "priorCategoryFamily"
    | "nextCategoryFamily"
    | "priorCategory"
    | "nextCategory"
  > = {
    priorQuery: prev || undefined,
    currentQuery: msg,
    tokenOverlap: 0,
    taxonomyOverlap: 0,
    priorTaxonomy: [],
    nextTaxonomy: [],
  };

  if (!prev) {
    return {
      ...base,
      action: "replace_current",
      shouldMerge: false,
      confidence: 1,
      reason: "no_prior_query",
    };
  }

  if (isExplicitNewSearch(msg)) {
    return {
      ...base,
      action: "replace_current",
      shouldMerge: false,
      confidence: 0.98,
      reason: "explicit_new_search",
    };
  }

  const overlap = computeTokenOverlap(prev, msg);
  const prevIntent = session?.intent ?? {};
  const prevCategory =
    prevIntent.category ?? extractIntentFromMessage(prev).category;
  const nextCategory = extractIntentFromMessage(msg).category;
  const priorFamily = categoryFamilyFromIntent(prev, prevCategory);
  const nextFamily = categoryFamilyFromIntent(msg, nextCategory);
  const prevTax = inferProductTaxonomy(prev);
  const nextTax = inferProductTaxonomy(msg);
  const taxShared = taxonomyOverlap(prevTax, nextTax);

  base.tokenOverlap = overlap;
  base.taxonomyOverlap = taxShared ? 1 : 0;
  base.priorTaxonomy = [...prevTax];
  base.nextTaxonomy = [...nextTax];
  base.priorCategoryFamily = priorFamily;
  base.priorCategory = prevCategory;
  base.nextCategoryFamily = nextFamily;
  base.nextCategory = nextCategory;

  if (isAttributeOnlyFollowUp(msg)) {
    return {
      ...base,
      action: "refine_current",
      shouldMerge: true,
      confidence: 0.96,
      reason: "attribute_only_follow_up",
    };
  }

  if (
    isSizeOnlyFollowUp(msg) &&
    inferProductTaxonomy(msg).size === 0 &&
    parseQueryAttributes(msg).productTypes.length === 0
  ) {
    return {
      ...base,
      action: "refine_current",
      shouldMerge: true,
      confidence: 0.95,
      reason: "size_only_follow_up",
    };
  }

  if (isApparelSubtypeRefinement(prev, msg)) {
    return {
      ...base,
      action: "refine_current",
      shouldMerge: true,
      confidence: 0.9,
      reason: "apparel_subtype_refinement",
    };
  }

  if (
    priorFamily !== "general" &&
    nextFamily !== "general" &&
    priorFamily !== nextFamily
  ) {
    return {
      ...base,
      action: "replace_current",
      shouldMerge: false,
      confidence: 0.93,
      reason: "category_family_change",
    };
  }

  if (prevTax.size > 0 && nextTax.size > 0 && !taxShared) {
    const prevApparel = [...prevTax].some((t) => APPAREL_TAXONOMY.has(t));
    const nextApparel = [...nextTax].some((t) => APPAREL_TAXONOMY.has(t));
    const compatibleApparel =
      prevApparel &&
      nextApparel &&
      areProductTypesCompatible(
        parseQueryAttributes(prev).productTypes,
        parseQueryAttributes(msg).productTypes,
      );
    if (!compatibleApparel) {
      return {
        ...base,
        action: "replace_current",
        shouldMerge: false,
        confidence: 0.9,
        reason: "product_taxonomy_change",
      };
    }
  }

  if (isStandaloneProductQuery(msg) && overlap < 0.3) {
    return {
      ...base,
      action: "replace_current",
      shouldMerge: false,
      confidence: 0.88,
      reason: "low_overlap_standalone_product",
    };
  }

  if (overlap >= 0.45 && msg.split(/\s+/).length <= 6) {
    return {
      ...base,
      action: "refine_current",
      shouldMerge: true,
      confidence: 0.82,
      reason: "high_token_overlap",
    };
  }

  if (taxShared && msg.split(/\s+/).length <= 5 && !isStandaloneProductQuery(msg)) {
    return {
      ...base,
      action: "refine_current",
      shouldMerge: true,
      confidence: 0.78,
      reason: "shared_taxonomy_short_follow_up",
    };
  }

  if (!looksLikeShoppingQuery(msg) && msg.split(/\s+/).length < 12) {
    return {
      ...base,
      action: "unrelated",
      shouldMerge: false,
      confidence: 0.7,
      reason: "not_shopping_query",
    };
  }

  return {
    ...base,
    action: "ambiguous",
    shouldMerge: false,
    confidence: 0.55,
    reason: "ambiguous_default_replace",
  };
}

export function shouldMergeIntentTransition(
  previousQuery: string,
  message: string,
  session?: SessionState,
): boolean {
  return classifyIntentTransition(previousQuery, message, session).shouldMerge;
}
