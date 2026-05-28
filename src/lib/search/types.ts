import type {
  ProductOffer,
  ProductSearchResults,
  RetailerId,
  ShoppingIntent,
} from "../types";

/** How a price was obtained — drives UI disclaimers and refresh policy. */
export type PriceSource =
  | "catalog_model"
  | "cached_quote"
  | "connector_api"
  | "nightly_index"
  | "scraped";

export interface SearchContext {
  userId?: string;
  sessionId?: string;
  skipCache?: boolean;
  skipPersist?: boolean;
}

export interface ResolvedProduct {
  catalogId: string;
  title: string;
  brand: string;
  confidence: number;
  matchReason: string;
  synthetic: boolean;
}

export interface SearchExecutionMeta {
  sessionId?: string;
  resolved: ResolvedProduct;
  durationMs: number;
  cacheHit: boolean;
  priceSource: PriceSource;
  quoteCount: number;
  /** Count of retailer rows updated from live APIs (e.g. Amazon PA-API). */
  liveQuoteCount?: number;
}

export interface EnrichedSearchResults extends ProductSearchResults {
  meta?: SearchExecutionMeta;
}

export interface PriceConnector {
  readonly id: string;
  readonly priority: number;
  supports(intent: ShoppingIntent): boolean;
  search(intent: ShoppingIntent): Promise<ProductSearchResults>;
}

export interface SearchServiceOptions extends SearchContext {
  mode?: "search" | "compare" | "link_similar";
}

export type { ProductOffer, ProductSearchResults, ShoppingIntent, RetailerId };
