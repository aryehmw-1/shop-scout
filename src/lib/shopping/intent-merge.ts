import { extractIntentFromMessage } from "../ai/extract-intent";
import { parseQueryAttributes } from "../retailers/search";
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

/** Follow-up that narrows the last search (color, brand, size) */
export function isRefinementMessage(text: string, session: SessionState): boolean {
  if (session.phase !== "ready" || !session.intent?.query?.trim()) return false;

  const t = text.trim();
  const lower = t.toLowerCase();

  if (isSizeOnlyFollowUp(t)) return true;

  if (looksLikeShoppingQuery(t) && t.split(/\s+/).length > 8) return false;

  const prevTypes = parseQueryAttributes(session.intent.query).productTypes;
  const newTypes = parseQueryAttributes(t).productTypes;
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
    /^(?:actually|instead|something else|different product|new search)\b/i.test(lower)
  )
    return false;

  if (
    t.split(/\s+/).length <= 6 &&
    (colors.length > 0 ||
      parseBrandFromText(t) ||
      parseSizeFromText(t) ||
      /^(black|white|navy|gray|grey)\b/i.test(lower))
  )
    return true;

  return false;
}

export function mergeSearchIntent(
  previous: Partial<ShoppingIntent>,
  message: string,
): Partial<ShoppingIntent> {
  const msg = stripShoppingPrefixes(message.trim());
  const attrs = parseQueryAttributes(msg);
  const brand = parseBrandFromText(msg) ?? previous.brand;
  const size = parseSizeFromText(msg) ?? previous.size;
  const prevColors =
    previous.colors ?? parseQueryAttributes(previous.query ?? "").colors;
  const colors = [...new Set([...prevColors, ...attrs.colors])];

  let query = (previous.query ?? "").trim();
  for (const c of attrs.colors) {
    if (!new RegExp(`\\b${c}\\b`, "i").test(query)) query = `${query} ${c}`.trim();
  }
  if (brand && !query.toLowerCase().includes(brand.toLowerCase().split(" ")[0]!)) {
    query = `${brand} ${query}`.trim();
  }
  if (size && !sizeAppearsInText(query, size)) {
    query = `${query} ${size}`.trim();
  }

  const gender = attrs.gender ?? previous.gender;
  const ageGroup = attrs.ageGroup ?? previous.ageGroup;
  const category =
    extractIntentFromMessage(msg, previous.zipCode).category ?? previous.category;

  const subtype =
    extractIntentFromMessage(msg, previous.zipCode).productSubtype ??
    previous.productSubtype;

  const base = {
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

  if (!attrs.productTypes.length && query) {
    return base;
  }

  const fresh = extractIntentFromMessage(msg, previous.zipCode);
  return {
    ...base,
    ...fresh,
    query: fresh.query && fresh.query.length > query.length ? fresh.query : query,
    brand: brand ?? fresh.brand,
    size: size ?? fresh.size,
    colors: colors.length ? colors : base.colors,
    gender: gender ?? fresh.gender,
    ageGroup: ageGroup ?? fresh.ageGroup,
    category: fresh.category ?? category,
    productSubtype: fresh.productSubtype ?? subtype,
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
