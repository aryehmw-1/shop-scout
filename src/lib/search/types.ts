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
  | "daily_index"
  | "historical_model"
  | "scraped";

export interface SearchContext {
  userId?: string;
  sessionId?: string;
  skipCache?: boolean;
  skipPersist?: boolean;
  skipImages?: boolean;
  /** Skip historical price model (faster bulk tests). */
  skipHistory?: boolean;
  /** Pre-computed link ingest (avoids double PDP fetch). */
  linkIngest?: import("../matching/link-ingest").LinkIngestResult;
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
  /** Skip Openverse / image API calls (faster tests and nightly jobs). */
  skipImages?: boolean;
  skipHistory?: boolean;
  /** Return cached/DB verified offers immediately — skip live retailer scrape. */
  fastOnly?: boolean;
  /** Skip live scrape but run deal scoring + display prep. */
  enrichOnly?: boolean;
}

export type { ProductOffer, ProductSearchResults, ShoppingIntent, RetailerId };
