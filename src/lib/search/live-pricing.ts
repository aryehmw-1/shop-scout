import type { CatalogItem } from "../retailers/catalog";
import type { ProductSearchResults, ShoppingIntent, VerifiedInventoryHitMeta } from "../types";
import type { PriceSource } from "./types";
import { catalogConnector } from "./connectors/catalog-connector";
import {
  fetchLiveQuotes,
  priceSourceForLiveOrigin,
} from "./fetch-live-quotes";
import { mergeLivePrices } from "./merge-live-prices";
import { finalizeSearchPrices } from "./price-truth";
import { loadPersistedLiveQuotes } from "../inventory/verified-inventory-resolver";
import type { LiveQuote } from "./providers/live-quote";
import type { RetailerId } from "../types";

export interface LiveEnrichedSearch {
  results: ProductSearchResults;
  priceSource: PriceSource;
  liveQuoteCount: number;
  verifiedInventoryHit?: VerifiedInventoryHitMeta;
}

function dedupeQuotesPreferPersisted(quotes: LiveQuote[]): LiveQuote[] {
  const byRetailer = new Map<RetailerId, LiveQuote>();
  for (const q of quotes) {
    const existing = byRetailer.get(q.retailerId);
    if (!existing || q.verifiedPersistedInventory) {
      byRetailer.set(q.retailerId, q);
    }
  }
  return [...byRetailer.values()];
}

/**
 * Catalog baseline + persisted verified inventory (priority) + live API quotes.
 */
export async function runSearchWithLivePricing(
  intent: ShoppingIntent,
  item: CatalogItem,
  options: {
    persistedQuotes?: LiveQuote[];
    verifiedInventoryHit?: VerifiedInventoryHitMeta;
  } = {},
): Promise<LiveEnrichedSearch> {
  let results = await catalogConnector.search(intent);
  let priceSource: PriceSource = "catalog_model";
  let liveQuoteCount = 0;

  const persisted =
    options.persistedQuotes?.length ?
      options.persistedQuotes
    : await loadPersistedLiveQuotes(item.id);

  const hasPersisted = persisted.length > 0;

  if (hasPersisted) {
    const merged = mergeLivePrices(results, persisted, item, intent, "scraped", {
      skipRelevanceFilter: true,
    });
    results = {
      ...merged.results,
      verifiedInventoryHit: options.verifiedInventoryHit ?? {
        matched: true,
        catalogId: item.id,
        matchMethod: "persisted_catalog_lookup",
        matchScore: 100,
        lastVerifiedAt: persisted[0]?.fetchedAt,
        confidence: persisted[0]?.matchConfidence,
        normalizationStatus: persisted[0]?.normalizationNote,
        qaStatus: persisted[0]?.qaStatus,
        candidateCount: 1,
      },
    };
    liveQuoteCount = merged.liveCount;
    if (liveQuoteCount > 0) priceSource = "scraped";
  }

  try {
    const { quotes, origin } = await fetchLiveQuotes(intent, item);
    if (quotes.length > 0) {
      const livePriceSource =
        priceSourceForLiveOrigin(origin, quotes) ?? "connector_api";
      const merged = mergeLivePrices(
        results,
        dedupeQuotesPreferPersisted([...persisted, ...quotes]),
        item,
        intent,
        livePriceSource,
        { skipRelevanceFilter: hasPersisted },
      );
      results = merged.results;
      if (merged.liveCount > liveQuoteCount) {
        liveQuoteCount = merged.liveCount;
        priceSource = livePriceSource;
      }
    }
  } catch (e) {
    console.error("[live-pricing] merge failed", e);
  }

  results = finalizeSearchPrices(results);

  return {
    results,
    priceSource,
    liveQuoteCount,
    verifiedInventoryHit: results.verifiedInventoryHit,
  };
}

export {
  getLivePricingProvider,
  isLivePricingEnabled,
  livePricingStatusMessage,
} from "./live-pricing-config";
