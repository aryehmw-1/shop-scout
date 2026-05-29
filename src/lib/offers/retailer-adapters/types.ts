import type { RetailerId } from "../../types";

/** First relevant product hit from a retailer search results page. */
export interface RetailerSearchHit {
  storeTitle?: string;
  priceUsd?: number;
  imageUrl?: string;
  /** Resolved product detail page (preferred for click + verified price). */
  pdpUrl?: string;
  externalId?: string;
  /** Set when price came from search JSON/HTML, not a PDP fetch. */
  fromSearchParser?: boolean;
  /** Amazon PA-API fallback when HTML scrape was blocked. */
  viaPaapi?: boolean;
}

export interface RetailerPageAdapter {
  readonly retailerId: RetailerId;
  extractSearchResults(html: string, pageUrl: string): RetailerSearchHit | null;
  extractPdpPage?(html: string, pageUrl: string): RetailerSearchHit | null;
}
