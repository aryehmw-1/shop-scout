import "server-only";

import { getBrightDataClient } from "../bright-data-client";
import type {
  RetailerIngestionAdapter,
  RawFetchResult,
  SearchProductsOptions,
} from "./adapter";
import {
  brightDataDatasetIdFor,
  getRetailerOperation,
  type RetailerConfig,
} from "./retailer-config";
import { buildOperationInput, type SourceOperation } from "./operations";

/**
 * The ONE Bright Data provider for every retailer. It reads the retailer's
 * dataset id and the requested OPERATION (keyword_search | url_lookup |
 * upc_lookup) from config, then shapes the Bright Data trigger accordingly —
 * Amazon, eBay, Walmart, etc. all flow through here. There is no per-retailer or
 * per-operation scraping code; one dataset, one async flow, the operation just
 * decides the payload + discover semantics.
 */
export class BrightDataAdapter implements RetailerIngestionAdapter {
  readonly mode = "bright_data" as const;
  readonly retailer: string;

  constructor(private readonly config: RetailerConfig) {
    this.retailer = config.name;
  }

  async searchProducts(
    query: string,
    options?: SearchProductsOptions,
  ): Promise<RawFetchResult> {
    const client = getBrightDataClient();
    if (!client) {
      throw new Error(
        `[ingestion] Bright Data is not configured (BRIGHT_DATA_API_KEY missing) for ${this.retailer}.`,
      );
    }
    const datasetId = brightDataDatasetIdFor(this.config);
    if (!datasetId) {
      throw new Error(
        `[ingestion] No Bright Data dataset id for ${this.retailer}. Set ${this.config.brightDataDatasetEnv} ` +
          `(env), or switch this retailer to official_api / disabled.`,
      );
    }

    const operation: SourceOperation = options?.operation ?? "keyword_search";
    const opConfig = getRetailerOperation(this.config, operation);
    if (!opConfig) {
      throw new Error(
        `[ingestion] ${this.retailer} does not support operation "${operation}".`,
      );
    }

    const input = [
      buildOperationInput(opConfig, query, {
        zipcode: options?.zipcode,
        language: options?.language,
      }),
    ];

    const { snapshotId, rows } = await client.scrape({
      datasetId,
      input,
      discoverBy: opConfig.discoverBy,
    });
    const limited = options?.limit ? rows.slice(0, options.limit) : rows;
    return { rows: limited, snapshotId };
  }
}
