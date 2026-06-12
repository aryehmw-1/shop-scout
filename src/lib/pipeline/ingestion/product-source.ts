import "server-only";

// The single, generic product-sourcing facade. Everything that ingests products
// goes through here — never a retailer-specific scraper. One method:
//
//     productSource.searchProducts({ retailer, query, sourceMode })
//     getRetailerSource(retailer).searchProducts(query, options)
//
// Under the hood it picks an adapter by source mode (bright_data | official_api |
// disabled). Bright Data is one source behind this seam, not a dependency: flip
// a single retailer to official_api later and nothing else changes.

import {
  DisabledAdapter,
  isRetailerSourceMode,
  type RetailerIngestionAdapter,
  type RetailerSourceMode,
  type RawFetchResult,
  type SearchProductsOptions,
} from "./adapter";
import { BrightDataAdapter } from "./bright-data-adapter";
import { OfficialApiAdapter } from "./official-api-adapter";
import { getRetailerConfig } from "./retailer-config";
import type { SourcingRetailer } from "../sourcing/retailer-strategy";

/**
 * Resolve the ingestion adapter for one retailer. `sourceMode` overrides the
 * retailer's configured default (e.g. a DB/admin toggle); otherwise the config
 * default is used. This is the ONLY place the source is chosen.
 */
export function getRetailerSource(
  retailer: SourcingRetailer,
  sourceMode?: RetailerSourceMode,
): RetailerIngestionAdapter {
  const config = getRetailerConfig(retailer);
  const mode: RetailerSourceMode =
    sourceMode && isRetailerSourceMode(sourceMode)
      ? sourceMode
      : config.defaultSourceMode;

  switch (mode) {
    case "disabled":
      return new DisabledAdapter(config.name);
    case "official_api":
      return new OfficialApiAdapter(config);
    case "bright_data":
    default:
      return new BrightDataAdapter(config);
  }
}

export interface SearchProductsRequest extends SearchProductsOptions {
  retailer: SourcingRetailer;
  query: string;
  /** Optional per-call override of the retailer's default source mode. */
  sourceMode?: RetailerSourceMode;
}

/**
 * Generic entry point used by the ingestion pipeline:
 *   productSource.searchProducts({ retailer, query, sourceMode })
 */
export const productSource = {
  async searchProducts({
    retailer,
    query,
    sourceMode,
    ...options
  }: SearchProductsRequest): Promise<RawFetchResult> {
    return getRetailerSource(retailer, sourceMode).searchProducts(query, options);
  },
};
