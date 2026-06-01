import type { CatalogItem } from "../../retailers/catalog";
import type { LiveQuote } from "./live-quote";
import { loadPersistedLiveQuotes } from "../../inventory/verified-inventory-resolver";

/**
 * Reuse non-expired verified quotes from SQLite — delegates to verified inventory resolver.
 */
export async function fetchCachedLiveQuotes(catalogId: string): Promise<LiveQuote[]> {
  return loadPersistedLiveQuotes(catalogId);
}

export async function fetchCachedLiveQuotesForItem(item: CatalogItem): Promise<LiveQuote[]> {
  return loadPersistedLiveQuotes(item.id);
}
