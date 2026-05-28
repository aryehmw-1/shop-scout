import { retailerSellsCategory } from "../retailers/meta";
import { tokenizeQuery } from "../retailers/search";
import type { CatalogItem } from "../retailers/catalog";
import type { LiveQuote } from "./providers/live-quote";
import type { ShoppingIntent } from "../types";

const CATEGORY_TITLE_HINTS: Record<string, RegExp> = {
  salad: /\b(salad|greens|lettuce|spinach|romaine|caesar|arugula|kale|coleslaw)\b/i,
  dairy: /\b(milk|dairy|yogurt|cheese|butter|cream|egg)\b/i,
  bakery: /\b(bread|bagel|bun|roll|bakery|toast|muffin)\b/i,
  produce: /\b(banana|apple|berry|avocado|tomato|potato|onion|carrot|fruit|vegetable|produce)\b/i,
  meat: /\b(chicken|beef|pork|steak|salmon|fish|turkey|bacon|sausage|meat)\b/i,
  pantry: /\b(chip|pretzel|cracker|cereal|coffee|pasta|rice|soda|juice|snack)\b/i,
  household: /\b(soap|shampoo|detergent|cleaner|towel|tissue|paper)\b/i,
  books: /\b(book|novel|paperback|hardcover|audiobook|textbook)\b/i,
  bedding: /\b(mattress|pillow|sheet|comforter|duvet|blanket|bedding)\b/i,
  home: /\b(sofa|couch|furniture|table|chair|lamp|rug|mattress|dresser)\b/i,
  clothing: /\b(shirt|pants|jeans|hoodie|jacket|dress|polo|shorts|apparel)\b/i,
  shoes: /\b(shoe|sneaker|boot|sandal|trainer|footwear|loafer|oxford)\b/i,
};

const IRRELEVANT_FOR_GROCERY =
  /\b(furniture|sofa|couch|mattress|dresser|bed\s+frame|sectional|recliner|nightstand|dining\s+set|bookshelf)\b/i;

function titleMatchesQuery(title: string, query: string): boolean {
  const lower = title.toLowerCase();
  const tokens = tokenizeQuery(query).filter((t) => t.length > 2);
  if (tokens.length === 0) return true;
  const hits = tokens.filter((t) => lower.includes(t));
  return hits.length >= 1;
}

function titleMatchesCategory(title: string, category: string): boolean {
  const hint = CATEGORY_TITLE_HINTS[category];
  if (hint?.test(title)) return true;
  return titleMatchesQuery(title, category);
}

/** Drop live API rows that are the wrong store type or obviously wrong product. */
export function isLiveQuoteRelevant(
  quote: LiveQuote,
  item: CatalogItem,
  query: string,
  intent?: Pick<ShoppingIntent, "ageGroup" | "category" | "query">,
): boolean {
  const effectiveCategory =
    intent?.ageGroup === "toddler" || intent?.ageGroup === "kids" ?
      intent.category === "shoes" || /\b(shoe|sneaker|boot)\b/i.test(query) ?
        "shoes"
      : "clothing"
    : item.category;

  if (!retailerSellsCategory(quote.retailerId, effectiveCategory)) {
    return false;
  }

  const title = quote.storeTitle.trim();
  if (!title) return false;

  const ageGroup = intent?.ageGroup;
  if (
    (ageGroup === "toddler" || ageGroup === "kids") &&
    effectiveCategory !== "books"
  ) {
    if (CATEGORY_TITLE_HINTS.books.test(title)) return false;
    if (/\b(novel|fiction|hardcover|paperback|audiobook|textbook|chapter\s+book)\b/i.test(title)) {
      return false;
    }
  }

  const groceryCategories = new Set([
    "salad",
    "dairy",
    "bakery",
    "produce",
    "meat",
    "pantry",
    "household",
  ]);

  if (groceryCategories.has(effectiveCategory)) {
    if (IRRELEVANT_FOR_GROCERY.test(title)) return false;
    if (!titleMatchesQuery(title, query) && !titleMatchesCategory(title, effectiveCategory)) {
      return false;
    }
    return true;
  }

  if (effectiveCategory === "home" || effectiveCategory === "bedding") {
    if (/\b(salad|milk|egg|banana|chicken|chip)\b/i.test(title)) return false;
  }

  if (!titleMatchesQuery(title, query) && effectiveCategory !== "general") {
    if (!titleMatchesCategory(title, effectiveCategory)) return false;
  }

  return true;
}
