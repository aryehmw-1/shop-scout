/**
 * Detect when a query is specific enough to search immediately — no clarification loop.
 */

import { parseBrandFromText } from "../shopping/brands";
import { parseQueryAttributes } from "../retailers/search";
import type { ShoppingIntent } from "../types";

const SPECIFIC_PRODUCT_PHRASES =
  /\b(potato\s+chips|classic\s+potato|paper\s+towels?|whole\s+milk|ground\s+coffee|honey\s+nut\s+cheerios|breakfast\s+cereal|sparkling\s+water|chicken\s+breast|greek\s+yogurt|caesar\s+salad|spring\s+mix|romaine\s+hearts)\b/i;

const VARIANT_DESCRIPTORS =
  /\b(classic|original|organic|unsweetened|whole|skim|2%|1%|large|family|jumbo|ground|instant|decaf|honey\s+nut|sour\s+cream|barbecue|bbq|ranch|salted|unsalted|gluten.?free)\b/i;

const PRODUCT_NOUNS =
  /\b(chips?|coffee|cereal|milk|yogurt|cheese|butter|eggs?|bread|bagel|pasta|rice|juice|soda|pop|towels?|tissue|detergent|soap|chicken|beef|salmon|bacon|spinach|salad|hoodie|sneakers?|jeans|joggers?)\b/i;

/** True when the user named a concrete product — search immediately. */
export function isObviousProductSearch(
  query: string,
  intent?: Partial<ShoppingIntent>,
): boolean {
  const q = query.trim();
  if (!q) return false;

  const lower = q.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);

  if (SPECIFIC_PRODUCT_PHRASES.test(lower)) return true;

  const brand = parseBrandFromText(q) ?? intent?.brand;
  const types = parseQueryAttributes(q).productTypes;

  if (brand && words.length >= 2 && PRODUCT_NOUNS.test(lower)) return true;

  if (types.length > 0 && words.length >= 2 && !/^(chips?|coffee|cereal|milk|snacks?|pantry)$/i.test(lower)) {
    return true;
  }

  if (words.length >= 3 && PRODUCT_NOUNS.test(lower)) return true;

  if (VARIANT_DESCRIPTORS.test(lower) && PRODUCT_NOUNS.test(lower) && words.length >= 2) {
    return true;
  }

  if (/\b(lay'?s|folgers|cheerios|bounty|charmin|kellogg|nature\s+valley|oreo|pepsi|coke|coca.?cola)\b/i.test(lower) && words.length >= 2) {
    return true;
  }

  if (intent?.size || intent?.colors?.length) return true;

  return false;
}
