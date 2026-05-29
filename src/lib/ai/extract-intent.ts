import { parseBrandFromText } from "../shopping/brands";
import { stripShoppingPrefixes } from "../shopping/query";
import { parseQueryAttributes } from "../retailers/search";
import type { ShoppingIntent } from "../types";

/** Rule-based intent — always runs (no API key needed) */
export function extractIntentFromMessage(
  message: string,
  zipCode?: string,
): Partial<ShoppingIntent> {
  const cleaned = stripShoppingPrefixes(message.trim());
  const lower = cleaned.toLowerCase();
  const attrs = parseQueryAttributes(cleaned);

  let category: string | undefined;
  if (/dress\s+shoe|oxford|loafer|sneaker|shoe|boot|sandal|cleat|footwear|heel/.test(lower))
    category = "shoes";
  else if (/shirt|pants|jeans|joggers?|chinos|hoodie|jacket|clothing|apparel|fashion|polo|shorts|leggings/.test(lower))
    category = "clothing";
  else if (/\bdress\b/.test(lower) && !/shoe|pants/.test(lower)) category = "clothing";
  else if (/sport|athletic|gym|yoga|basketball|football|soccer|fitness/.test(lower))
    category = "sports";
  else if (/salad|greens|lettuce|spinach|arugula/.test(lower)) category = "salad";
  else if (/milk|egg|butter|dairy|cheese|yogurt/.test(lower)) category = "dairy";
  else if (/bread|bakery|toast|bagel/.test(lower)) category = "bakery";
  else if (/banana|produce|fruit|vegetable|apple|berry/.test(lower)) category = "produce";
  else if (/chicken|meat|beef|pork|protein|fish|salmon/.test(lower)) category = "meat";
  else if (/towel|soap|shampoo|clean|household/.test(lower)) category = "household";
  else if (/pasta|rice|cereal|coffee|snack|chips|soda|juice/.test(lower)) category = "pantry";
  else if (/hardcover|paperback|novel|fiction|nonfiction|textbook|\bbook\b|books\b/.test(lower))
    category = "books";
  else if (/mattress|pillow|sheets?|comforter|duvet|bedding|memory\s+foam|\bbeds?\b|bed\s+frame|box\s+spring/.test(lower))
    category = "bedding";
  else if (/sofa|couch|furniture|lamp|rug|home\s+decor/.test(lower)) category = "home";

  if (
    !category &&
    attrs.ageGroup &&
    (attrs.ageGroup === "toddler" || attrs.ageGroup === "kids") &&
    !/book|novel|milk|egg|salad|produce|meat|snack/i.test(lower)
  ) {
    category = "clothing";
  }

  const brand = parseBrandFromText(cleaned);

  let productSubtype: string | undefined;
  if (attrs.productTypes.includes("jeans")) productSubtype = "jeans";
  else if (attrs.productTypes.includes("joggers")) productSubtype = "joggers";
  else if (attrs.productTypes.includes("chinos")) productSubtype = "chinos";
  else if (attrs.productTypes.some((t) => t.includes("sweatpant")))
    productSubtype = "sweatpants";
  else if (attrs.productTypes.includes("cargo")) productSubtype = "cargo_pants";
  else if (attrs.productTypes.some((t) => /dress/.test(t) && t.includes("pant")))
    productSubtype = "dress_pants";
  else if (attrs.productTypes.includes("running")) productSubtype = "running_shoes";
  else if (attrs.productTypes.includes("sneaker")) productSubtype = "sneakers";
  else if (attrs.productTypes.some((t) => t.includes("dress shoe")))
    productSubtype = "dress_shoes";
  else if (attrs.productTypes.includes("boot")) productSubtype = "boots";
  else if (attrs.productTypes.includes("sandal")) productSubtype = "sandals";

  return {
    query: cleaned,
    category,
    zipCode,
    gender: attrs.gender,
    ageGroup: attrs.ageGroup,
    brand,
    colors: attrs.colors.length ? attrs.colors : undefined,
    productSubtype,
    organic: lower.includes("organic") ? true : undefined,
  };
}
