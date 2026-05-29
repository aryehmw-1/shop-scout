import type { CatalogItem } from "../retailers/catalog";
import type { ProductSearchResults, ShoppingIntent } from "../types";
import type { PriceSource } from "./types";
import { catalogConnector } from "./connectors/catalog-connector";
import {
  fetchLiveQuotes,
  priceSourceForLiveOrigin,
} from "./fetch-live-quotes";
import { mergeLivePrices } from "./merge-live-prices";
import { finalizeSearchPrices } from "./price-truth";

export interface LiveEnrichedSearch {
  results: ProductSearchResults;
  priceSource: PriceSource;
  liveQuoteCount: number;
}

/**
 * Catalog baseline + Amazon PA-API + optional DB cache for live prices.
 */
export async function runSearchWithLivePricing(
  intent: ShoppingIntent,
  item: CatalogItem,
): Promise<LiveEnrichedSearch> {
  let results = await catalogConnector.search(intent);
  let priceSource: PriceSource = "catalog_model";
  let liveQuoteCount = 0;

  try {
    const { quotes, origin } = await fetchLiveQuotes(intent, item);
    if (quotes.length > 0) {
      const livePriceSource =
        priceSourceForLiveOrigin(origin, quotes) ?? "connector_api";
      const merged = mergeLivePrices(results, quotes, item, intent, livePriceSource);
      results = merged.results;
      liveQuoteCount = merged.liveCount;
      if (liveQuoteCount > 0) {
        priceSource = livePriceSource;
      }
    }
  } catch (e) {
    console.error("[live-pricing] merge failed", e);
  }

  results = finalizeSearchPrices(results);

  return { results, priceSource, liveQuoteCount };
}

export {
  getLivePricingProvider,
  isLivePricingEnabled,
  livePricingStatusMessage,
} from "./live-pricing-config";
