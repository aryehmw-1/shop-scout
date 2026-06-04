import { productUrlMatchesRetailer } from "../matching/url-parser";
import type { RetailerId } from "../types";

export type ProductUrlKind = "pdp" | "search" | "homepage" | "invalid";

const SEARCH_PATH =
  /\/search\b|\/s\?|\/browse\b|\/shop\/search|search-results|catalogsearch|\/shopping\/search|\/product-search/i;
const SEARCH_PARAMS = ["q", "query", "keyword", "Ntt", "searchTerm", "search"] as const;

const PDP_PATH =
  /\/dp\/|\/gp\/product\/|\/ip\/|\/itm\/|\/p\/|\/products?\//i;

const NON_PRODUCT_CATALOG =
  /explore-all-products|\/pages\/explore|\/store\/[^/]+\/pages\/[^/]+$/i;

/**
 * Classify a retailer URL for offer-quality decisions.
 */
export function classifyProductUrl(
  url: string | undefined,
  retailer?: RetailerId,
): ProductUrlKind {
  if (!url?.startsWith("http")) return "invalid";
  try {
    const u = new URL(url);
    const pathQuery = `${u.pathname}${u.search}`.toLowerCase();

    if (/index\.jsp|\/store\/index\b/.test(pathQuery)) return "homepage";

    if (NON_PRODUCT_CATALOG.test(pathQuery)) return "search";

    if (SEARCH_PATH.test(pathQuery)) return "search";
    for (const key of SEARCH_PARAMS) {
      const val = u.searchParams.get(key);
      if (val && val.trim().length >= 2) return "search";
    }

    if (PDP_PATH.test(pathQuery)) {
      const segments = u.pathname.split("/").filter(Boolean);
      if (segments.length >= 2) return "pdp";
    }

    const segments = u.pathname.split("/").filter(Boolean);
    if (!u.search && segments.length <= 2) return "homepage";
    if (segments.length >= 3) return "pdp";

    return "search";
  } catch {
    return "invalid";
  }
}

export function isPdpProductUrl(url: string | undefined): boolean {
  return classifyProductUrl(url) === "pdp";
}

/** Legacy name — search URLs are NOT product pages. */
export function isUsableStoredProductUrl(
  url: string,
  _retailer?: RetailerId,
): boolean {
  return isPdpProductUrl(url);
}

/** Only persist/override click URLs with a real product detail page. */
export function shouldUseStoredProductUrl(
  url: string | undefined,
  retailer: RetailerId,
): url is string {
  return (
    Boolean(url?.startsWith("http")) &&
    productUrlMatchesRetailer(url!, retailer) &&
    isPdpProductUrl(url)
  );
}

export function isSearchProductUrl(url: string | undefined): boolean {
  return classifyProductUrl(url) === "search";
}
