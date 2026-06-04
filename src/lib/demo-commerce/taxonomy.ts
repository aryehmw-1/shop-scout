/** Normalized top-level commerce categories for the demo catalog. */
export const TOP_LEVEL_CATEGORIES = [
  "Grocery",
  "Electronics",
  "Home",
  "Beauty",
  "Clothing",
  "Books",
  "Furniture",
  "Kitchen",
  "Sports",
  "Office",
  "Health",
  "Toys",
] as const;

export type TopLevelCategory = (typeof TOP_LEVEL_CATEGORIES)[number];

const CATEGORY_KEYWORDS: Array<{ category: TopLevelCategory; pattern: RegExp }> = [
  { category: "Grocery", pattern: /\b(milk|egg|cheese|yogurt|bread|cereal|coffee|snack|grocery|produce|meat|chicken|beef|pasta|rice|soda|juice|butter|organic|spinach|lettuce|pantry|dairy)\b/i },
  { category: "Beauty", pattern: /\b(shampoo|conditioner|moisturizer|makeup|lipstick|mascara|foundation|serum|sunscreen|skincare|beauty|fragrance|lotion)\b/i },
  { category: "Books", pattern: /\b(book|novel|paperback|hardcover|kindle|author|isbn|reading|textbook)\b/i },
  { category: "Electronics", pattern: /\b(laptop|phone|tablet|headphone|earbud|speaker|tv|monitor|camera|charger|cable|usb|bluetooth|electronics|gaming)\b/i },
  { category: "Clothing", pattern: /\b(shirt|pants|jeans|dress|jacket|hoodie|sneaker|shoe|sock|underwear|bra|apparel|clothing|mens|womens)\b/i },
  { category: "Furniture", pattern: /\b(sofa|couch|chair|table|desk|dresser|mattress|bed frame|furniture|nightstand)\b/i },
  { category: "Kitchen", pattern: /\b(cookware|pan|pot|knife|blender|mixer|air fryer|kitchen|utensil|plate|bowl)\b/i },
  { category: "Home", pattern: /\b(towel|sheet|pillow|blanket|curtain|rug|lamp|vacuum|cleaner|detergent|household|home decor|storage bin)\b/i },
  { category: "Sports", pattern: /\b(bike|bicycle|dumbbell|yoga|fitness|running|athletic|sports|golf|tennis|basketball)\b/i },
  { category: "Office", pattern: /\b(pen|pencil|notebook|printer|paper|stapler|office|desk organizer)\b/i },
  { category: "Health", pattern: /\b(vitamin|supplement|medicine|pain relief|bandage|thermometer|health|protein powder)\b/i },
  { category: "Toys", pattern: /\b(toy|lego|puzzle|game|doll|action figure|kids)\b/i },
];

/** Retailers → allowed top-level categories (empty = allow all). */
export const RETAILER_CATEGORY_ALLOWLIST: Record<string, TopLevelCategory[]> = {
  walmart: ["Grocery", "Home", "Electronics", "Clothing", "Beauty", "Health", "Sports", "Kitchen", "Toys", "Office"],
  target: ["Grocery", "Home", "Electronics", "Clothing", "Beauty", "Health", "Sports", "Kitchen", "Toys", "Office"],
  amazon: ["Grocery", "Electronics", "Home", "Clothing", "Beauty", "Books", "Sports", "Kitchen", "Office", "Health", "Toys", "Furniture"],
  kroger: ["Grocery", "Health"],
  costco: ["Grocery", "Electronics", "Home", "Clothing", "Beauty", "Health", "Sports", "Kitchen", "Office", "Furniture"],
  aldi: ["Grocery"],
  bestbuy: ["Electronics"],
  kohls: ["Clothing", "Home", "Beauty"],
  macys: ["Clothing", "Beauty", "Home"],
  nike: ["Clothing", "Sports"],
  gap: ["Clothing"],
  oldnavy: ["Clothing"],
  wayfair: ["Furniture", "Home", "Kitchen"],
  ikea: ["Furniture", "Home", "Kitchen"],
  homedepot: ["Home", "Kitchen"],
  lowes: ["Home", "Kitchen"],
  sephora: ["Beauty"],
  ulta: ["Beauty"],
  barnesnoble: ["Books"],
  "barnesandnoble.com": ["Books"],
  bookshop: ["Books"],
  halfpricebooks: ["Books"],
  dicks: ["Sports", "Clothing"],
  footlocker: ["Clothing", "Sports"],
};

export function normalizeCategory(
  title: string,
  rawCategory: string | null | undefined,
  retailer?: string,
): { category: TopLevelCategory; confidence: number } {
  const blob = `${title} ${rawCategory ?? ""}`.toLowerCase();
  let best: { category: TopLevelCategory; confidence: number } = {
    category: "Home",
    confidence: 0.35,
  };

  for (const row of CATEGORY_KEYWORDS) {
    if (row.pattern.test(blob)) {
      return { category: row.category, confidence: 0.82 };
    }
  }

  const raw = (rawCategory ?? "").toLowerCase();
  if (/grocery|dairy|produce|pantry|meat|bakery|beverage|salad/.test(raw)) {
    return { category: "Grocery", confidence: 0.75 };
  }
  if (/clothing|apparel|fashion|shoe/.test(raw)) {
    return { category: "Clothing", confidence: 0.7 };
  }
  if (/book/.test(raw)) {
    return { category: "Books", confidence: 0.8 };
  }

  return best;
}

export function retailerAllowsCategory(
  retailer: string,
  category: TopLevelCategory,
): boolean {
  const allow = RETAILER_CATEGORY_ALLOWLIST[retailer];
  if (!allow?.length) return true;
  return allow.includes(category);
}
