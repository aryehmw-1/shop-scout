import { getLivePricingProvider } from "./live-pricing-config";
import type { CatalogItem } from "../retailers/catalog";
import type { ShoppingIntent } from "../types";
import { fetchAmazonLiveQuotes } from "./providers/amazon-paapi-server";
import { isAmazonPaapiConfigured } from "./providers/amazon-paapi-config";
import { fetchCachedLiveQuotesForItem } from "./providers/cached-quotes";
import type { LiveQuote } from "./providers/live-quote";

export type LiveQuoteOrigin = "cache" | "amazon_paapi" | null;

export interface FetchedLiveQuotes {
  quotes: LiveQuote[];
  origin: LiveQuoteOrigin;
}

function mergeQuoteLists(...lists: LiveQuote[][]): LiveQuote[] {
  const byRetailer = new Map<string, LiveQuote>();
  for (const list of lists) {
    for (const q of list) {
      if (!byRetailer.has(q.retailerId)) {
        byRetailer.set(q.retailerId, q);
      }
    }
  }
  return [...byRetailer.values()];
}

async function fetchCachedQuotes(
  intent: ShoppingIntent,
  item: CatalogItem,
): Promise<FetchedLiveQuotes> {
  const mode = getLivePricingProvider();
  if (mode === "off") {
    return { quotes: [], origin: null };
  }

  const quotes = await fetchCachedLiveQuotesForItem(item);
  return { quotes, origin: quotes.length ? "cache" : null };
}

/**
 * Live prices: Amazon PA-API (when configured) + optional DB cache.
 * No SerpAPI / Google Shopping.
 */
export async function fetchLiveQuotes(
  intent: ShoppingIntent,
  item: CatalogItem,
): Promise<FetchedLiveQuotes> {
  const amazonPromise =
    isAmazonPaapiConfigured() ?
      fetchAmazonLiveQuotes(intent, item).catch((e) => {
        console.error("[fetch-live-quotes] Amazon PA-API", e);
        return [] as LiveQuote[];
      })
    : Promise.resolve([]);

  const [amazonQuotes, cached] = await Promise.all([
    amazonPromise,
    fetchCachedQuotes(intent, item),
  ]);

  const quotes = mergeQuoteLists(amazonQuotes, cached.quotes);

  let origin: LiveQuoteOrigin = cached.origin;
  if (amazonQuotes.length > 0) {
    origin = cached.quotes.length > 0 ? cached.origin : "amazon_paapi";
  }

  return { quotes, origin };
}

export function priceSourceForLiveOrigin(
  origin: LiveQuoteOrigin,
): "connector_api" | "cached_quote" | "nightly_index" | null {
  if (origin === "amazon_paapi") return "connector_api";
  if (origin === "cache") return "cached_quote";
  return null;
}
