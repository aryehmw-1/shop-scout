import { searchUsesOwnDbOnly } from "../own-db/config";
import { getLivePricingProvider } from "./live-pricing-config";
import type { CatalogItem } from "../retailers/catalog";
import type { ShoppingIntent } from "../types";
import { fetchAmazonLiveQuotes } from "./providers/amazon-paapi";
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

export interface FetchLiveQuotesOptions {
  /** Daily job only — allow Amazon PA-API. Searches use own DB by default. */
  allowLiveRetailerApis?: boolean;
}

/**
 * Read prices from Shop Scout's own DB. Live retailer APIs run once per day in the daily index job.
 */
export async function fetchLiveQuotes(
  intent: ShoppingIntent,
  item: CatalogItem,
  options: FetchLiveQuotesOptions = {},
): Promise<FetchedLiveQuotes> {
  const allowLive =
    options.allowLiveRetailerApis === true ||
    (!searchUsesOwnDbOnly() && isAmazonPaapiConfigured());

  const amazonPromise =
    allowLive ?
      fetchAmazonLiveQuotes(intent, item).catch((e) => {
        console.error("[fetch-live-quotes] Amazon PA-API", e);
        return [] as LiveQuote[];
      })
    : Promise.resolve([] as LiveQuote[]);

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
  quotes: LiveQuote[] = [],
): import("./types").PriceSource | null {
  if (origin === "amazon_paapi") return "connector_api";
  if (origin === "cache") {
    if (
      quotes.length > 0 &&
      quotes.every((q) => q.priceSource === "scraped")
    ) {
      return "scraped";
    }
    return "cached_quote";
  }
  return null;
}
