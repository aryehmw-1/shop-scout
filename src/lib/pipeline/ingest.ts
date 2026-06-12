import "server-only";

// Raw ingestion layer. Pulls a retailer dataset via the universal client and
// stores every row in raw_product_records EXACTLY as received (full JSON kept in
// rawJson). Nothing here is published — that's the pipeline's job.

import { prisma } from "../db/prisma";
import { getRetailerSource } from "./ingestion/product-source";
import type { RetailerSourceMode } from "./ingestion/adapter";
import { getRetailerConfig } from "./ingestion/retailer-config";
import {
  operationForIntent,
  type IngestIntent,
  type SourceOperation,
} from "./ingestion/operations";
import type { SourcingRetailer } from "./sourcing/retailer-strategy";

/** Best-effort field extraction. Bright Data shapes vary per dataset, so we map
 * the common keys and always retain the untouched row in rawJson. */
function pick(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v.replace(/[^0-9.]/g, ""));
      if (!Number.isNaN(n)) return n;
    }
  }
  return undefined;
}

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
  // upc_lookup → cross-retailer match), overridable explicitly.
  const operation: SourceOperation =
    req.operation ?? operationForIntent(req.intent ?? "import");

  const { rows, snapshotId } = await source.searchProducts(req.query, {
    operation,
    zipcode: req.zipcode,
    language: req.language,
    limit: req.limit,
  });
  if (!rows.length) return { retailer: config.name, inserted: 0, snapshotId };

  const alias = config.fieldAliases ?? {};
  const data = rows.map((row) => ({
    retailer: config.name,
    retailerDomain: config.domain,
    productUrl: pick(row, ["product_url", "url", "link"]),
    title: pick(row, ["title", "name", "product_name", ...(alias.title ?? [])]),
    brand: pick(row, ["brand", "manufacturer", ...(alias.brand ?? [])]),
    imageUrl: pick(row, ["image_url", "image", "main_image", "images", ...(alias.image ?? [])]),
    price: pickNumber(row, ["price", "final_price", "current_price", ...(alias.price ?? [])]),
    availability: pick(row, ["availability", "stock", "in_stock"]),
    upcGtin: pick(row, ["upc", "upc_gtin", "barcode", ...(alias.upc ?? [])]),
    ean: pick(row, ["ean"]),
    gtin: pick(row, ["gtin"]),
    modelNumber: pick(row, ["model_number", "model", "mpn", "part_number"]),
    size: pick(row, ["size", "package_size", "weight"]),
    quantity: pick(row, ["quantity", "count", "pack_size"]),
    unitCount: pickNumber(row, ["unit_count", "units"]),
    color: pick(row, ["color", "colour"]),
    variant: pick(row, ["variant", "style", "configuration"]),
    category: pick(row, ["category", "department", "categories"]),
    rawJson: JSON.stringify(row),
    processingStatus: "RAW",
  }));

  const result = await prisma.rawProductRecord.createMany({ data });
  return { retailer: config.name, inserted: result.count, snapshotId };
}
