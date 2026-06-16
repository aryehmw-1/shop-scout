import type { RetailerId } from "../types";

/**
 * Multi-brand STORES whose name in a query means "from this retailer" — not part
 * of the product title. "Target shirt" = shirts from Target (never the "Target
 * Shooting" tee); "Walmart TV" = TVs from Walmart. Deliberately excludes single-
 * brand names (Nike, Adidas…) which are real brands and stay in the query.
 * Longer/multi-word names first so "best buy" wins over a bare word.
 */
const RETAILER_PATTERNS: Array<[RegExp, RetailerId]> = [
  [/\bbest\s?buy\b/i, "bestbuy"],
  [/\bold\s?navy\b/i, "oldnavy"],
  [/\btj\s?maxx\b/i, "tjmaxx"],
  [/\bfoot\s?locker\b/i, "footlocker"],
  [/\bsam'?s(?:\s+club)?\b/i, "sams"],
  [/\bdick'?s(?:\s+sporting(?:\s+goods)?)?\b/i, "dicks"],
  [/\bwalmart\b/i, "walmart"],
  [/\btarget\b/i, "target"],
  [/\bamazon\b/i, "amazon"],
  [/\bebay\b/i, "ebay"],
  [/\bcostco\b/i, "costco"],
  [/\bikea\b/i, "ikea"],
  [/\bkroger\b/i, "kroger"],
  [/\bpublix\b/i, "publix"],
  [/\baldi\b/i, "aldi"],
  [/\binstacart\b/i, "instacart"],
  [/\bkohl'?s\b/i, "kohls"],
  [/\bmacy'?s\b/i, "macys"],
  [/\bross\b/i, "ross"],
  [/\bburlington\b/i, "burlington"],
  [/\bzappos\b/i, "zappos"],
];

export interface RetailerQuery {
  /** The retailer named in the query, if any. */
  retailer?: RetailerId;
  /** The query with the retailer name removed (the actual product to search). */
  query: string;
}

/**
 * Pull a retailer name out of a search query. Returns the retailer (as a
 * preference) and the cleaned product query. Only strips the name when a real
 * product remains afterward — "walmart" alone stays a plain query.
 */
export function extractRetailerFromQuery(raw: string): RetailerQuery {
  const query = raw.trim();
  for (const [pattern, retailer] of RETAILER_PATTERNS) {
    if (!pattern.test(query)) continue;
    const cleaned = query.replace(pattern, " ").replace(/\s{2,}/g, " ").trim();
    // Need a product left over (≥2 chars, and not just stray punctuation).
    if (/[a-z0-9]{2,}/i.test(cleaned)) {
      return { retailer, query: cleaned };
    }
  }
  return { query };
}
