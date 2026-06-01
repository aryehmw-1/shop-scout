import {
  categoryClarificationFromRule,
  findCategoryClarifyRule,
  type CategoryClarifyKind,
} from "./category-clarify";
import { isObviousProductSearch } from "./product-query-specificity";
import { findBroadKeywordRule } from "./shopping-keywords";
import { parseQueryAttributes } from "../retailers/search";
import { parseSizeFromText } from "../shopping/sizes";
import type { ClarificationState, ShoppingIntent } from "../types";

const PANTS_SPECIFIC =
  /jeans|denim|chinos?|joggers?|slacks|khakis|cargo|sweatpants?|track\s+pants|dress\s+pants|trousers/i;
const SHOES_SPECIFIC =
  /sneakers?|running\s+shoes?|trainers?|dress\s+shoes?|oxfords?|loafers?|boots?|sandals?|heels?|cleats?|hiking\s+shoes?|basketball\s+shoes?/i;

export const PANTS_OPTIONS = [
  "Jeans",
  "Chinos",
  "Joggers",
  "Dress pants",
  "Cargo pants",
  "Sweatpants",
] as const;

export const SHOES_OPTIONS = [
  "Running shoes",
  "Casual sneakers",
  "Dress shoes",
  "Boots",
  "Sandals",
  "Basketball shoes",
] as const;

function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function matchOption(answer: string, options: string[]): string | undefined {
  const a = normalizeAnswer(answer);
  for (const opt of options) {
    const o = normalizeAnswer(opt);
    if (a === o || a.includes(o) || o.includes(a)) return opt;
  }

  for (const opt of options) {
    const words = normalizeAnswer(opt).split(/\s+/).filter((w) => w.length > 3);
    if (words.some((w) => a.includes(w))) return opt;
  }

  const shortcuts: Record<string, string> = {
    jean: "Jeans",
    jeans: "Jeans",
    chino: "Chinos",
    chinos: "Chinos",
    jogger: "Joggers",
    joggers: "Joggers",
    sneaker: "Casual sneakers",
    sneakers: "Casual sneakers",
    runner: "Running shoes",
    runners: "Running shoes",
    running: "Running shoes",
    boot: "Boots",
    boots: "Boots",
    sandal: "Sandals",
    sandals: "Sandals",
    loafer: "Dress shoes",
    loafers: "Dress shoes",
    oxford: "Dress shoes",
    cargo: "Cargo pants",
    sweatpant: "Sweatpants",
    sweatpants: "Sweatpants",
    caesar: "Caesar salad kit",
    romaine: "Romaine hearts",
    arugula: "Arugula",
    greens: "Bagged salad greens",
    bagged: "Bagged salad greens",
    whole: "Whole milk",
    oat: "Oat milk",
    greek: "Greek yogurt",
    sourdough: "Sourdough",
    bagel: "Bagels",
    bagels: "Bagels",
    banana: "Bananas",
    bananas: "Bananas",
    apple: "Apples",
    apples: "Apples",
    chicken: "Chicken breast",
    salmon: "Salmon fillet",
    chips: "Potato chips",
    coffee: "Coffee",
    pasta: "Pasta",
  };
  for (const [key, label] of Object.entries(shortcuts)) {
    if (a === key || new RegExp(`\\b${key}\\b`).test(a)) return label;
  }
  return undefined;
}

export function subtypeFromOption(option: string): string {
  return option.toLowerCase().replace(/\s+/g, "_");
}

const BROAD_QUERY =
  /^(salad|salads|milk|dairy|bread|eggs?|chicken|meat|produce|fruit|snacks?|chips?|coffee|pasta|pants|trousers|shoes?|jacket|coat)$/i;

export function queryWithSubtype(
  baseQuery: string,
  option: string,
  intent: Partial<ShoppingIntent>,
): string {
  const base = baseQuery.trim();
  if (BROAD_QUERY.test(base)) {
    return option;
  }

  const subtype = option.toLowerCase();
  const parts = [intent.brand, base, subtype];
  if (intent.gender === "mens" && !/\bmens?\b/i.test(base)) parts.unshift("mens");
  if (intent.gender === "womens" && !/\bwomens?\b/i.test(base)) parts.unshift("womens");
  for (const c of intent.colors ?? []) {
    if (!parts.join(" ").toLowerCase().includes(c)) parts.push(c);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

const KEYWORD_KIND_MAP: Record<string, ClarificationState["kind"]> = {
  salad: "salad",
  milk: "dairy",
  eggs: "dairy",
  bread: "bakery",
  produce: "produce",
  meat: "meat",
  snacks: "pantry",
  pants: "pants",
  shoes: "shoes",
  hoodie: "hoodie",
  kids_clothing: "kids_clothing",
  toddler: "kids_clothing",
};

function categoryForKind(kind: ClarificationState["kind"]): string | undefined {
  const map: Partial<Record<CategoryClarifyKind, string>> = {
    salad: "salad",
    dairy: "dairy",
    bakery: "bakery",
    produce: "produce",
    meat: "meat",
    pantry: "pantry",
    shoes: "shoes",
    pants: "clothing",
    outerwear: "clothing",
    hoodie: "clothing",
    kids_clothing: "clothing",
  };
  return map[kind as CategoryClarifyKind];
}

export function detectClarificationNeeded(
  query: string,
  intent: Partial<ShoppingIntent>,
): ClarificationState | null {
  const lower = query.toLowerCase();
  const attrs = parseQueryAttributes(query);

  const wordCount = lower.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 8) return null;

  if (isObviousProductSearch(query, intent)) return null;

  const keywordRule = findBroadKeywordRule(query);
  if (keywordRule) {
    const kind = KEYWORD_KIND_MAP[keywordRule.id] ?? "pantry";
    return {
      kind,
      question: keywordRule.defaultQuestion,
      options: [...keywordRule.defaultOptions],
      baseQuery: query,
      baseIntent: {
        ...intent,
        category: keywordRule.category ?? intent.category,
        gender: intent.gender ?? attrs.gender,
      },
    };
  }

  const categoryRule = findCategoryClarifyRule(query);
  if (categoryRule && wordCount <= 6) {
    return categoryClarificationFromRule(categoryRule, query, intent);
  }

  if (/\b(pants|trousers)\b/i.test(lower) && !PANTS_SPECIFIC.test(lower)) {
    if (parseSizeFromText(query) || intent.size) return null;

    const gender =
      intent.gender === "mens" ? "men's" : intent.gender === "womens" ? "women's" : "";
    return {
      kind: "pants",
      question: gender
        ? `What kind of ${gender} pants do you want?`
        : "What kind of pants are you looking for?",
      options: [...PANTS_OPTIONS],
      baseQuery: query,
      baseIntent: { ...intent, category: "clothing", gender: intent.gender ?? attrs.gender },
    };
  }

  if (/\bshoes?\b/i.test(lower) && !SHOES_SPECIFIC.test(lower)) {
    const gender =
      intent.gender === "mens" ? "men's" : intent.gender === "womens" ? "women's" : "";
    return {
      kind: "shoes",
      question: gender
        ? `What type of ${gender} shoes?`
        : "What type of shoes are you shopping for?",
      options: [...SHOES_OPTIONS],
      baseQuery: query,
      baseIntent: { ...intent, category: "shoes", gender: intent.gender ?? attrs.gender },
    };
  }

  if (
    /\b(jacket|coat)\b/i.test(lower) &&
    !/hoodie|parka|rain|winter|leather|denim|bomber|puffer|windbreaker/i.test(lower)
  ) {
    return {
      kind: "outerwear",
      question: "What kind of outerwear?",
      options: ["Hoodie", "Winter coat", "Rain jacket", "Light jacket", "Puffer jacket"],
      baseQuery: query,
      baseIntent: { ...intent, category: "clothing" },
    };
  }

  return null;
}

export function resolveClarificationAnswer(
  answer: string,
  clarifying: ClarificationState,
): ShoppingIntent | null {
  const picked = matchOption(answer, clarifying.options);
  const trimmed = answer.trim();

  if (!picked) {
    if (trimmed.length < 2 || trimmed.split(/\s+/).length > 8) return null;
    const merged = queryWithSubtype(clarifying.baseQuery, trimmed, clarifying.baseIntent);
    return {
      query: merged,
      category:
        clarifying.baseIntent.category ??
        categoryForKind(clarifying.kind) ??
        (clarifying.kind === "shoes" ? "shoes" : "clothing"),
      zipCode: clarifying.baseIntent.zipCode,
      gender: clarifying.baseIntent.gender,
      ageGroup: clarifying.baseIntent.ageGroup,
      brand: clarifying.baseIntent.brand,
      colors: clarifying.baseIntent.colors,
      size: clarifying.baseIntent.size,
    };
  }

  const query = queryWithSubtype(
    clarifying.baseQuery,
    picked,
    clarifying.baseIntent,
  );

  const apparelKinds = new Set(["pants", "shoes", "outerwear"]);

  return {
    query,
    category:
      clarifying.baseIntent.category ??
      categoryForKind(clarifying.kind) ??
      (clarifying.kind === "shoes" ? "shoes" : "clothing"),
    zipCode: clarifying.baseIntent.zipCode,
    gender: clarifying.baseIntent.gender,
    ageGroup: clarifying.baseIntent.ageGroup,
    brand: clarifying.baseIntent.brand,
    colors: clarifying.baseIntent.colors,
    size: clarifying.baseIntent.size,
    productSubtype: apparelKinds.has(clarifying.kind) ? subtypeFromOption(picked) : undefined,
  };
}

export function isLikelyClarificationAnswer(
  text: string,
  clarifying: ClarificationState,
): boolean {
  if (matchOption(text, clarifying.options)) return true;
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= 4;
}

export function isClarifyFollowUpQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\?\s*$/.test(t)) return true;
  return /^(what|which|how|why|can you|could you|do you|does that|is there)\b/i.test(t);
}
