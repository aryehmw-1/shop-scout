import "server-only";

import type {
  RetailerIngestionAdapter,
  RawFetchResult,
  SearchProductsOptions,
} from "./adapter";
import type { RetailerConfig } from "./retailer-config";

/**
 * Per-retailer official-API ingestion. This is the seam that lets us move a
 * retailer off Bright Data and onto its first-party API later WITHOUT touching
 * the verification, search, or publishing layers — only this registry grows.
 *
 * To onboard a retailer's official API: register a fetcher keyed by domain and
 * flip that retailer's source mode to `official_api`. Until then, an
 * official-API source throws a clear error rather than silently scraping.
 */
export type OfficialApiFetcher = (
  config: RetailerConfig,
  query: string,
  options?: SearchProductsOptions,
) => Promise<RawFetchResult>;

const OFFICIAL_API_REGISTRY: Record<string, OfficialApiFetcher> = {};

export function registerOfficialApi(domain: string, fetcher: OfficialApiFetcher): void {
  OFFICIAL_API_REGISTRY[domain.toLowerCase()] = fetcher;
}

export function hasOfficialApi(domain: string): boolean {
  return Boolean(OFFICIAL_API_REGISTRY[domain.toLowerCase()]);
}

export class OfficialApiAdapter implements RetailerIngestionAdapter {
  readonly mode = "official_api" as const;
  readonly retailer: string;

  constructor(private readonly config: RetailerConfig) {
    this.retailer = config.name;
  }

  async searchProducts(
    query: string,
    options?: SearchProductsOptions,
  ): Promise<RawFetchResult> {
    const fetcher = OFFICIAL_API_REGISTRY[this.config.domain.toLowerCase()];
    if (!fetcher) {
      throw new Error(
        `[ingestion] ${this.retailer} is set to official_api but no official API is registered for ` +
          `${this.config.domain}. Register one with registerOfficialApi() or switch back to bright_data.`,
      );
    }
    return fetcher(this.config, query, options);
  }
}
