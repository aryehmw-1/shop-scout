import "server-only";

// Raw ingestion layer. Pulls a retailer dataset via the universal client and
// stores every row in raw_product_records EXACTLY as received (full JSON kept in
// rawJson). Nothing here is published — that's the pipeline's job.

import { prisma } from "../db/prisma";
import { getRetailerSource } from "./ingestion/product-source";
import type { RetailerSourceMode } from "./ingestion/adapter";
import { getRetailerConfig } from "./ingestion/retailer-config";
import { mapBrightDataRow } from "./ingestion/normalize-row";
import {
  operationForIntent,
  type IngestIntent,
  type SourceOperation,
} from "./ingestion/operations";
import type { SourcingRetailer } from "./sourcing/retailer-strategy";

export interface IngestResult {
  retailer: string;
  inserted: number;
  snapshotId?: string;
}

export interface IngestRequest {
  retailer: SourcingRetailer;
  /** keyword | url | upc — interpreted per the resolved operation. */
  query: string;
  /**
   * What we're doing, which selects the Bright Data operation:
   *   import (default) → keyword_search · refresh → url_lookup ·
   *   cross_retailer_match → upc_lookup.
   * `operation` overrides `intent` when both are given.
   */
  intent?: IngestIntent;
  operation?: SourceOperation;
  /** ZIP for localized pricing/availability. */
  zipcode?: string;
  language?: string;
  /** Override the retailer's configured source mode for this run. */
  sourceMode?: RetailerSourceMode;
  /** Cap rows kept (top-retailers-first keeps only the best few offers). */
  limit?: number;
}

/**
 * Generic ingestion: search ONE retailer via the productSource facade and
 * persist results as RAW records. Source-agnostic — Bright Data, an official
 * API, or disabled are all selected by config/mode, never by branching here.
 * Field aliases from retailer config extend the generic extraction so a
 * retailer's quirky key names are handled by config, not bespoke code.
 */
export async function ingestRetailerProducts(req: IngestRequest): Promise<IngestResult> {
  const config = getRetailerConfig(req.retailer);
  if (!config.enabled) return { retailer: config.name, inserted: 0 };

  const source = getRetailerSource(req.retailer, req.sourceMode);
  if (source.mode === "disabled") return { retailer: config.name, inserted: 0 };

  // Operation chosen by intent (keyword_search → import, url_lookup → refresh,
  // upc_lookup → cross-retailer match), overridable explicitly. Catalog-built
  // retailers (e.g. IKEA) override the import operation to category_discovery.
  const intent: IngestIntent = req.intent ?? "import";
  const operation: SourceOperation =
    req.operation ??
    (intent === "import" && config.importOperation
      ? config.importOperation
      : operationForIntent(intent));

  const { rows, snapshotId } = await source.searchProducts(req.query, {
    operation,
    zipcode: req.zipcode,
    language: req.language,
    limit: req.limit,
  });
  if (!rows.length) return { retailer: config.name, inserted: 0, snapshotId };

  const data = rows.map((row) => mapBrightDataRow(row, config));

  const result = await prisma.rawProductRecord.createMany({ data });
  return { retailer: config.name, inserted: result.count, snapshotId };
}
