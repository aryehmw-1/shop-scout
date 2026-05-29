import { extractIntentFromMessage } from "../ai/extract-intent";
import { areProductTypesCompatible, parseQueryAttributes } from "../retailers/search";
import { parseBrandFromText } from "./brands";
import { looksLikeShoppingQuery, stripShoppingPrefixes } from "./query";
import {
  isSizeOnlyFollowUp,
  parseSizeFromText,
  sizeAppearsInText,
} from "./sizes";
import type { SessionState, ShoppingIntent } from "../types";

const REFINE_PREFIX =
  /^(?:in|only|just|make it|show me|i want(?:\s+it)?\s+in|with|in the|the)\s+/i;

const COLOR_WORD =
  /^(black|white|navy|blue|red|green|gray|grey|brown|pink|purple|beige|tan|orange|yellow|olive|burgundy|maroon|teal|cream|charcoal)$/i;

/** User is starting a fresh product search instead of refining the last one. */
export function isExplicitNewSearch(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return (
    /^(?:new search|something else|different product|forget (?:that|this|it)|start over|search for something else|nevermind|never mind)\b/.test(
      lower,
    ) ||
    /^(?:actually|instead),?\s+(?:find|search|show|get|i want|i need)\b/i.test(text)
  );
}

/** User switched product (sweaters → joggers, beds → milk, etc.). */
export function isProductTypeSwitch(previousQuery: string, message: string): boolean {
  const prev = parseQueryAttributes(previousQuery).productTypes;
  const next = parseQueryAttributes(stripShoppingPrefixes(message.trim())).productTypes;
  if (!prev.length || !next.length) return false;
  return !areProductTypesCompatible(prev, next);
}

/** Short follow-up that only adds color, size, brand, etc. */
export function isAttributeFollowUp(message: string, previousQuery: string): boolean {
  const msg = stripShoppingPrefixes(message.trim());
  const lower = msg.toLowerCase();
  if (!previousQuery.trim()) return false;
  if (isProductTypeSwitch(previousQuery, message)) return false;

  if (parseSizeFromText(msg)) return true;
  if (parseQueryAttributes(msg).colors.length > 0 && msg.split(/\s+/).length <= 10) {
    return true;
  }
  if (parseBrandFromText(msg) && msg.split(/\s+/).length <= 10) return true;
  if (REFINE_PREFIX.test(lower)) return true;
  if (/^(in|with|only|make it|size)\b/i.test(lower)) return true;
  if (COLOR_WORD.test(lower.split(/\s+/)[0] ?? "")) return true;
  if (/^(large|medium|small|xl|xxl|xs|xx?s|xx?l)\b/i.test(lower)) return true;

  return false;
}

/** Follow-up that narrows the last search (color, brand, size, same product type). */
export function isRefinementMessage(text: string, session: SessionState): boolean {
  if (session.phase !== "ready" || !session.intent?.query?.trim()) return false;

  const t = text.trim();
  const lower = t.toLowerCase();

  if (isExplicitNewSearch(t)) return false;
  if (isSizeOnlyFollowUp(t)) return true;

  if (looksLikeShoppingQuery(t) && t.split(/\s+/).length > 8) return false;

  const prevTypes = parseQueryAttributes(session.intent.query).productTypes;
  const newTypes = parseQueryAttributes(t).productTypes;
  if (
    newTypes.length > 0 &&
    prevTypes.length > 0 &&
    newTypes.some((nt) => prevTypes.includes(nt))
  ) {
    return t.split(/\s+/).length <= 10;
  }

  if (
    newTypes.length > 0 &&
    prevTypes.length > 0 &&
    !newTypes.some((nt) => prevTypes.includes(nt)) &&
    !REFINE_PREFIX.test(lower) &&
    !parseSizeFromText(t)
  ) {
    return false;
  }

  if (REFINE_PREFIX.test(lower)) return true;
  if (parseBrandFromText(t) && t.split(/\s+/).length <= 10) return true;

  const colors = parseQueryAttributes(t).colors;
  if (colors.length > 0 && t.split(/\s+/).length <= 10) return true;

  if (
    t.split(/\s+/).length <= 6 &&
    (colors.length > 0 ||
      parseBrandFromText(t) ||
      parseSizeFromText(t) ||
      COLOR_WORD.test(lower.split(/\s+/)[0] ?? ""))
  ) {
    return true;
  }

  return false;
}

/** Keep refining the active search across multiple chat turns. */
export function shouldMergeWithPreviousSearch(
  text: string,
  session: SessionState,
): boolean {
  if (session.phase !== "ready" || !session.intent?.query?.trim()) return false;
  if (isExplicitNewSearch(text)) return false;
  if (isProductTypeSwitch(session.intent.query, text)) return false;
  if (isAttributeFollowUp(text, session.intent.query)) return true;
  return isRefinementMessage(text, session);
}

export function mergeSearchIntent(
  previous: Partial<ShoppingIntent>,
  message: string,
): Partial<ShoppingIntent> {
  const msg = stripShoppingPrefixes(message.trim());

  if (isProductTypeSwitch(previous.query ?? "", message)) {
    const fresh = extractIntentFromMessage(msg, previous.zipCode);
    return {
      query: fresh.query || msg,
      category: fresh.category,
      gender: fresh.gender,
      ageGroup: fresh.ageGroup,
      productSubtype: fresh.productSubtype,
      zipCode: previous.zipCode,
      size: parseSizeFromText(msg) ?? fresh.size,
      colors: parseQueryAttributes(msg).colors.length ?
          parseQueryAttributes(msg).colors
        : undefined,
    };
  }

  const attrs = parseQueryAttributes(msg);
  const brand = parseBrandFromText(msg) ?? previous.brand;
  const size = parseSizeFromText(msg) ?? previous.size;
  const prevColors =
    previous.colors ?? parseQueryAttributes(previous.query ?? "").colors;
  const colors = [...new Set([...prevColors, ...attrs.colors])];

  let query = (previous.query ?? "").trim();
  if (!query) {
    query = msg;
  }

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

  if (attrs.productTypes.length > 0) {
    for (const pt of attrs.productTypes) {
      const label = pt.replace(/_/g, " ");
      if (!query.toLowerCase().includes(label)) {
        query = `${query} ${label}`.trim();
      }
    }
  } else if (
    isAttributeFollowUp(msg, previous.query ?? "") &&
    !parseQueryAttributes(query).productTypes.length &&
    fresh.query &&
    fresh.query !== msg
  ) {
    // Attribute-only follow-up — keep accumulated query, don't replace with "large" etc.
  } else if (
    msg.split(/\s+/).length >= 2 &&
    !isAttributeFollowUp(msg, previous.query ?? "") &&
    fresh.query &&
    fresh.query.length > query.length
  ) {
    query = fresh.query;
  }

  return {
    ...previous,
    query,
    brand,
    size,
    colors: colors.length ? colors : undefined,
    gender,
    ageGroup,
    category,
    productSubtype: subtype,
    zipCode: previous.zipCode,
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
