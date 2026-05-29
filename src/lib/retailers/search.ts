import { sizesCompatible } from "../catalog/size-normalize";
import type { ClothingAgeGroup, ClothingGender, RetailerId, ShoppingIntent } from "../types";
import { learningBoost } from "../learning/preference-learner";

export interface ScoredCatalogItem<T> {
  item: T;
  score: number;
}

export interface QueryAttributes {
  gender?: ClothingGender;
  ageGroup?: ClothingAgeGroup;
  shoeStyle?: "dress" | "running" | "boot" | "sandal" | "casual";
  /** When set, item must match one of these product types (hoodie, jeans, etc.) */
  productTypes: string[];
  colors: string[];
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "for",
  "and",
  "or",
  "i",
  "im",
  "am",
  "is",
  "are",
  "to",
  "my",
  "me",
  "we",
  "our",
  "some",
  "any",
  "of",
  "in",
  "on",
  "at",
  "with",
  "this",
  "that",
  "need",
  "want",
  "find",
  "get",
  "buy",
  "looking",
  "cheapest",
  "best",
  "near",
  "week",
  "today",
  "please",
  "show",
  "mens",
  "men",
  "womens",
  "women",
  "super",
  "toddler",
  "toddlers",
  "baby",
  "infant",
  "kids",
  "children",
]);

const COLOR_WORDS = [
  "black",
  "white",
  "red",
  "blue",
  "navy",
  "gray",
  "grey",
  "green",
  "pink",
  "brown",
  "beige",
  "purple",
  "yellow",
  "orange",
];

function parseProductTypes(lower: string): string[] {
  const types: string[] = [];
  if (/hoodie|hoody|sweatshirt|pullover/.test(lower))
    types.push("hoodie", "hoody", "sweatshirt", "pullover", "fleece");
  if (/sweaters?|cardigans?/.test(lower)) types.push("sweater", "cardigan", "knit");
  if (/jeans|denim/.test(lower)) types.push("jeans", "denim");
  if (/\bchinos?\b|khakis/.test(lower)) types.push("chinos", "khakis");
  if (/\bjoggers?\b|track\s+pants/.test(lower)) types.push("joggers", "jogger");
  if (/sweatpants?/.test(lower)) types.push("sweatpants", "sweatpant");
  if (/cargo\s+pants|cargo/.test(lower)) types.push("cargo", "cargo pants");
  if (/dress\s+pants|slacks|trousers/.test(lower))
    types.push("dress pants", "slacks", "trousers");
  if (/\bpants\b/.test(lower) && !types.length) types.push("pants");
  if (/running\s+shoes?|runners?\b/.test(lower))
    types.push("running", "running shoes", "sneaker");
  if (/sneakers?|trainers?/.test(lower)) types.push("sneaker", "sneakers", "trainer");
  if (/dress\s+shoes?|oxfords?|loafers?|brogues?/.test(lower))
    types.push("dress shoe", "oxford", "loafer", "dress");
  if (/\bboots?\b/.test(lower)) types.push("boot", "boots");
  if (/sandals?|flip.?flops?/.test(lower)) types.push("sandal", "sandals");
  if (/basketball\s+shoes?/.test(lower)) types.push("basketball", "sneaker");
  if (/hiking\s+shoes?|trail\s+runners?/.test(lower)) types.push("hiking", "trail");
  if (/\bshoe|shoes\b/.test(lower) && !types.some((t) => /sneaker|boot|sandal|running|dress|hiking/.test(t)))
    types.push("shoe", "shoes", "footwear");
  if (/pretzel/.test(lower)) types.push("pretzel", "pretzels");
  if (/chip/.test(lower)) types.push("chips", "chip");
  if (/popcorn/.test(lower)) types.push("popcorn");
  if (/cracker/.test(lower)) types.push("cracker", "crackers");
  if (/milk/.test(lower)) types.push("milk");
  if (/egg/.test(lower)) types.push("egg", "eggs");
  if (/polo/.test(lower)) types.push("polo");
  if (/dress\b/.test(lower) && !/shoe/.test(lower)) types.push("dress");
  if (/jacket|coat/.test(lower)) types.push("jacket", "coat");
  if (/shorts/.test(lower)) types.push("shorts");
  if (/onesie|romper/.test(lower)) types.push("onesie", "romper");
  if (/audiobook|audible/.test(lower)) types.push("audiobook", "audio");
  if (/\bbook\b|books|novel|fiction|nonfiction|hardcover|paperback|textbook/.test(lower))
    types.push("book", "books", "novel", "fiction");
  if (/mattress/.test(lower)) types.push("mattress");
  if (/\bbed\s+frame\b|platform\s+bed|bedframe/.test(lower))
    types.push("bed frame", "bedframe", "frame");
  if (/\bbeds?\b|box\s+spring/.test(lower) && !/mattress/.test(lower))
    types.push("bed", "beds", "bed frame");
  if (/sheets?|bedding|linen/.test(lower)) types.push("sheets", "bedding", "linen");
  if (/comforter|duvet|blanket/.test(lower)) types.push("comforter", "duvet", "blanket");
  if (/pillow/.test(lower)) types.push("pillow");
  if (/\b(salad|salads|greens|lettuce|spinach|romaine|arugula|caesar)\b/.test(lower))
    types.push("salad", "greens", "lettuce");
  if (/\b(milk|yogurt|cheese|butter|dairy)\b/.test(lower))
    types.push("milk", "dairy", "yogurt", "cheese");
  if (/\b(eggs?)\b/.test(lower)) types.push("egg", "eggs");
  if (/\b(bread|bagel|bakery|toast)\b/.test(lower)) types.push("bread", "bagel", "bakery");
  if (/\b(banana|apple|berry|produce|avocado|tomato)\b/.test(lower))
    types.push("produce", "fruit", "vegetable");
  if (/\b(chicken|beef|pork|salmon|meat|fish)\b/.test(lower))
    types.push("chicken", "beef", "meat", "fish");
  return types;
}

function parseColors(lower: string): string[] {
  return COLOR_WORDS.filter((c) => new RegExp(`\\b${c}\\b`).test(lower));
}

function parseAgeGroup(lower: string): ClothingAgeGroup | undefined {
  if (
    /\b(toddler|toddlers|baby|babies|infant|infants|newborn|2t|3t|4t|5t|12m|18m|24m)\b/.test(
      lower,
    )
  )
    return "toddler";
  if (/\b(kids?|children|child|youth|boys?|girls?|junior|juniors)\b/.test(lower))
    return "kids";
  return undefined;
}

function parseGender(lower: string): ClothingGender | undefined {
  if (/\b(men'?s?|mens|male)\b/.test(lower)) return "mens";
  if (/\b(women'?s?|womens|female|ladies)\b/.test(lower)) return "womens";
  if (/\b(boys?)\b/.test(lower)) return "mens";
  if (/\b(girls?)\b/.test(lower)) return "womens";
  return undefined;
}

export function parseQueryAttributes(query: string): QueryAttributes {
  const lower = query.toLowerCase();
  const attrs: QueryAttributes = {
    productTypes: parseProductTypes(lower),
    colors: parseColors(lower),
  };

  attrs.ageGroup = parseAgeGroup(lower);
  attrs.gender = parseGender(lower);
  if (!attrs.ageGroup && attrs.gender) attrs.ageGroup = "adult";

  if (/dress\s+shoe|dress\s+shoes|oxford|loafer|brogue|formal\s+shoe/.test(lower))
    attrs.shoeStyle = "dress";
  else if (/running|trainer|jogging|athletic\s+shoe/.test(lower))
    attrs.shoeStyle = "running";
  else if (/\bboot/.test(lower)) attrs.shoeStyle = "boot";
  else if (/sandal/.test(lower)) attrs.shoeStyle = "sandal";
  else if (/sneaker|casual\s+shoe/.test(lower)) attrs.shoeStyle = "casual";

  return attrs;
}

export function resolveIntentAttributes(intent: ShoppingIntent): QueryAttributes {
  const parsed = parseQueryAttributes(intent.query);
  const colors = [
    ...new Set([...(intent.colors ?? []), ...parsed.colors]),
  ];
  return {
    ...parsed,
    colors,
    gender: intent.gender ?? parsed.gender,
    ageGroup: intent.ageGroup ?? parsed.ageGroup,
  };
}

function itemMatchesBrand(blob: string, brand: string): boolean {
  const b = brand.toLowerCase();
  const first = b.split(/\s+/)[0] ?? b;
  return blob.includes(b) || blob.includes(first);
}

export function expandApparelProductTypes(types: string[]): string[] {
  const out = new Set(types);
  const pantsFamily =
    types.some((t) =>
      /pants|jogger|chino|trouser|slacks|sweatpant|cargo|legging/.test(t),
    );
  if (pantsFamily) {
    for (const t of [
      "pants",
      "joggers",
      "jogger",
      "chinos",
      "chino",
      "trousers",
      "slacks",
      "sweatpants",
      "leggings",
    ]) {
      out.add(t);
    }
  }
  return [...out];
}

function typesShareToken(a: string[], b: string[]): boolean {
  const setA = new Set(expandApparelProductTypes(a));
  const setB = new Set(expandApparelProductTypes(b));
  for (const x of setA) {
    for (const y of setB) {
      if (x === y || (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x)))) {
        return true;
      }
    }
  }
  return false;
}

/** True when a follow-up narrows the same product (e.g. chinos → joggers), not a new category. */
export function areProductTypesCompatible(
  previousTypes: string[],
  nextTypes: string[],
): boolean {
  if (!previousTypes.length || !nextTypes.length) return true;

  const prevMattress = previousTypes.includes("mattress");
  const nextMattress = nextTypes.includes("mattress");
  const prevBedFrame = previousTypes.some((t) => /bed frame|bedframe|frame/.test(t));
  const nextBedFrame = nextTypes.some((t) => /bed frame|bedframe|frame/.test(t));
  const prevBed =
    previousTypes.some((t) => /\bbeds?\b/.test(t)) && !prevMattress;
  const nextBed = nextTypes.some((t) => /\bbeds?\b/.test(t)) && !nextMattress;

  if ((prevMattress && (nextBed || nextBedFrame)) || (nextMattress && (prevBed || prevBedFrame))) {
    return false;
  }

  return typesShareToken(previousTypes, nextTypes);
}

function itemMatchesProductTypesStrong(
  item: { title: string; keywords: string[] },
  types: string[],
): boolean {
  if (types.length === 0) return true;
  const expanded = expandApparelProductTypes(types);
  const title = item.title.toLowerCase();
  const kw = item.keywords.map((k) => k.toLowerCase());
  return expanded.some(
    (t) =>
      title.includes(t) ||
      kw.some((k) => k === t || k.includes(t) || t.includes(k)),
  );
}

export function tokenizeQuery(query: string): string[] {
  const normalized = query
    .toLowerCase()
    .replace(/\b\d+\s*pack\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ");
  return normalized
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t) && t !== "pack");
}

export function scoreCatalogText(
  text: string,
  tokens: string[],
  fullQuery: string,
): number {
  const hay = text.toLowerCase();
  const q = fullQuery.toLowerCase().trim();
  let score = 0;

  if (q.length > 2 && hay.includes(q)) score += 50;

  for (const token of tokens) {
    if (hay.includes(token)) score += 12;
    else if (token.length > 3 && hay.includes(token.slice(0, -1))) score += 6;
    else if (token === "beds" && hay.includes("bed")) score += 10;
    else if (token === "bed" && hay.includes("beds")) score += 10;
    else if (token === "mattresses" && hay.includes("mattress")) score += 10;
  }

  return score;
}

function blobMatchesProductTypes(blob: string, types: string[]): boolean {
  if (types.length === 0) return true;
  const expanded = expandApparelProductTypes(types);
  return expanded.some((t) => blob.includes(t));
}

function blobMatchesColors(blob: string, colors: string[]): boolean {
  if (colors.length === 0) return true;
  return colors.every((c) => {
    const alt = c === "grey" ? "gray" : c === "gray" ? "grey" : c;
    return blob.includes(c) || blob.includes(alt);
  });
}

function buildItemBlob(item: {
  title: string;
  brand: string;
  size: string;
  keywords: string[];
}): string {
  return `${item.title} ${item.brand} ${item.size} ${item.keywords.join(" ")}`.toLowerCase();
}

function detectItemAudience(blob: string): {
  gender?: ClothingGender;
  ageGroup: ClothingAgeGroup;
} {
  let ageGroup: ClothingAgeGroup = "adult";
  if (/\b(toddler|baby|babies|infant|newborn|2t|3t|4t|5t|12m|18m|24m)\b/.test(blob))
    ageGroup = "toddler";
  else if (/\b(kids?|children|child|youth|boys?|girls?|junior)\b/.test(blob))
    ageGroup = "kids";

  let gender: ClothingGender | undefined;
  if (/\b(women|womens|female|ladies|girls?)\b/.test(blob)) gender = "womens";
  else if (/\b(men|mens|male|boys?)\b/.test(blob) && !/\bwomen/.test(blob))
    gender = "mens";

  return { gender, ageGroup };
}

/** Kids/toddler searches should not surface books, furniture, etc. unless explicitly requested */
function audienceCategoryMismatch(
  item: { category: string },
  attrs: QueryAttributes,
  query: string,
): boolean {
  if (!attrs.ageGroup || attrs.ageGroup === "adult") return false;
  const lower = query.toLowerCase();

  if (attrs.ageGroup === "toddler" || attrs.ageGroup === "kids") {
    if (item.category === "books" && !/\b(book|novel|reading|audiobook)\b/.test(lower)) {
      return true;
    }
    if (item.category === "home" || item.category === "bedding") return true;
    if (
      (item.category === "salad" ||
        item.category === "dairy" ||
        item.category === "bakery" ||
        item.category === "produce" ||
        item.category === "meat" ||
        item.category === "pantry" ||
        item.category === "household") &&
      !/\b(baby\s+food|formula|snack|milk|pouch|puree)\b/.test(lower)
    ) {
      return true;
    }
  }

  return false;
}

/** Hard exclude wrong department for apparel queries */
function apparelAudienceMismatch(
  blob: string,
  attrs: QueryAttributes,
  category: string,
): boolean {
  if (category !== "clothing" && category !== "shoes") return false;
  if (!attrs.gender && !attrs.ageGroup) return false;

  const item = detectItemAudience(blob);

  if (attrs.ageGroup === "toddler") {
    if (item.ageGroup !== "toddler") return true;
  } else if (attrs.ageGroup === "kids") {
    if (item.ageGroup === "adult" && !/\bkids?|children|youth|boys?|girls?\b/.test(blob))
      return true;
  } else if (attrs.ageGroup === "adult") {
    if (item.ageGroup === "toddler") return true;
    if (item.ageGroup === "kids" && attrs.gender) return true;
  }

  if (attrs.gender === "mens") {
    if (/\bwomen|womens|female|ladies\b/.test(blob)) return true;
    if (item.ageGroup === "toddler" && !/\bboys?\b/.test(blob)) return true;
  }
  if (attrs.gender === "womens") {
    if (/\bmen|mens|male\b/.test(blob) && !/\bwomen/.test(blob)) return true;
    if (item.ageGroup === "toddler" && !/\bgirls?\b/.test(blob)) return true;
  }

  return false;
}

function attributeAdjustments(
  blob: string,
  category: string,
  attrs: QueryAttributes,
): number {
  let delta = 0;

  if (attrs.gender === "mens") {
    if (/\bmen|mens|male|boys?\b/.test(blob)) delta += 14;
    if (/\bwomen|womens|female|ladies|girls?\b/.test(blob)) delta -= 50;
  }
  if (attrs.gender === "womens") {
    if (/\bwomen|womens|female|ladies|girls?\b/.test(blob)) delta += 14;
    if (/\bmen|mens|male|boys?\b/.test(blob) && !/\bwomen/.test(blob)) delta -= 50;
  }

  if (attrs.ageGroup === "toddler") {
    if (/\btoddler|baby|infant|2t|3t|4t|5t|12m|18m|24m|newborn\b/.test(blob))
      delta += 16;
    else if (!/\btoddler|baby|infant\b/.test(blob)) delta -= 40;
  }
  if (attrs.ageGroup === "kids") {
    if (/\bkids?|children|youth|boys?|girls?|junior\b/.test(blob)) delta += 12;
    else if (/\btoddler|baby|infant\b/.test(blob)) delta -= 20;
    else if (/\bmen|mens|women|womens\b/.test(blob)) delta -= 35;
  }

  if (attrs.shoeStyle === "dress" && category === "shoes") {
    if (/\bdress|formal|oxford|loafer|brogue|leather\b/.test(blob)) delta += 18;
    if (/\brunning|trainer|athletic|basketball|soccer\b/.test(blob)) delta -= 35;
  }
  if (attrs.shoeStyle === "running" && category === "shoes") {
    if (/\brunning|trainer|athletic|jogging\b/.test(blob)) delta += 18;
    if (/\bdress|formal|oxford|loafer\b/.test(blob)) delta -= 30;
  }
  if (attrs.shoeStyle === "boot" && category === "shoes") {
    if (/\bboot/.test(blob)) delta += 15;
    if (/\bsneaker|running\b/.test(blob)) delta -= 20;
  }

  return delta;
}

export function scoreItem<T extends {
  title: string;
  brand: string;
  size: string;
  category: string;
  keywords: string[];
}>(item: T, intent: ShoppingIntent, retailer?: RetailerId): number {
  const tokens = tokenizeQuery(intent.query);
  const attrs = resolveIntentAttributes(intent);
  const blob = buildItemBlob(item);

  if (!blobMatchesProductTypes(blob, attrs.productTypes)) return 0;
  if (
    attrs.productTypes.length > 0 &&
    !itemMatchesProductTypesStrong(item, attrs.productTypes)
  )
    return 0;
  if (!blobMatchesColors(blob, attrs.colors)) return 0;
  if (apparelAudienceMismatch(blob, attrs, item.category)) return 0;
  if (audienceCategoryMismatch(item, attrs, intent.query)) return 0;

  if (intent.brand && !itemMatchesBrand(blob, intent.brand)) return 0;

  let score = scoreCatalogText(blob, tokens, intent.query);
  score += attributeAdjustments(blob, item.category, attrs);

  if (intent.size) {
    const want = intent.size;
    if (sizesCompatible(want, item.size)) {
      score += 22;
    } else if (
      /\b(x?s|x?l|small|medium|large|xx?l|\d{2}x\d{2})\b/i.test(want) &&
      /\b(x?s|x?l|small|medium|large|xx?l|\d{2}x\d{2})\b/i.test(item.size) &&
      !sizesCompatible(want, item.size)
    ) {
      return 0;
    }
  }

  if (intent.category && item.category === intent.category) score += 28;
  if (intent.category && item.category !== intent.category) score -= 40;

  if (intent.organic === true && "organic" in item && !(item as { organic?: boolean }).organic) {
    score = Math.max(0, score - 20);
  }

  if (intent.learningProfile) {
    score += learningBoost(intent.learningProfile, item, retailer ?? "");
  }

  return score;
}

const GROCERY_CATEGORIES = new Set([
  "salad",
  "dairy",
  "bakery",
  "produce",
  "meat",
  "pantry",
  "household",
]);

export function queryRequiresStrictMatch(query: string): boolean {
  const attrs = parseQueryAttributes(query);
  return (
    attrs.productTypes.length > 0 ||
    attrs.colors.length > 0 ||
    !!attrs.gender ||
    !!attrs.ageGroup
  );
}

/** Single-word or very short grocery-style query — must match catalog category tightly */
export function queryRequiresCategoryMatch(
  query: string,
  category?: string,
): boolean {
  if (!category || !GROCERY_CATEGORIES.has(category)) return false;
  const words = query.trim().split(/\s+/).filter(Boolean);
  return words.length <= 3;
}
