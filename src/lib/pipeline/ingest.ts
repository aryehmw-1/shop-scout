import "server-only";

// Raw ingestion layer. Pulls a retailer dataset via the universal client and
// stores every row in raw_product_records EXACTLY as received (full JSON kept in
// rawJson). Nothing here is published — that's the pipeline's job.

import { prisma } from "../db/prisma";
import { getBrightDataClient } from "./bright-data-client";

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

/**
 * Scrape one retailer_sources row and persist results as RAW records.
 * Returns how many rows were stored.
 */
export async function ingestRetailerSource(
  retailerSourceId: string,
  input: Record<string, unknown>[],
): Promise<IngestResult> {
  const source = await prisma.retailerSource.findUnique({ where: { id: retailerSourceId } });
  if (!source || !source.active) {
    throw new Error(`retailer source ${retailerSourceId} not found or inactive`);
  }
  const client = getBrightDataClient();
  if (!client) throw new Error("Bright Data is not configured.");

  const { snapshotId, rows } = await client.scrape({
    datasetId: source.brightDataDatasetId,
    input,
  });

  if (!rows.length) return { retailer: source.retailerName, inserted: 0, snapshotId };

  const data = rows.map((row) => ({
    retailer: source.retailerName,
    retailerDomain: source.retailerDomain,
    productUrl: pick(row, ["product_url", "url", "link"]),
    title: pick(row, ["title", "name", "product_name"]),
    brand: pick(row, ["brand", "manufacturer"]),
    imageUrl: pick(row, ["image_url", "image", "main_image", "images"]),
    price: pickNumber(row, ["price", "final_price", "current_price"]),
    availability: pick(row, ["availability", "stock", "in_stock"]),
    upcGtin: pick(row, ["upc", "upc_gtin", "barcode"]),
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
  return { retailer: source.retailerName, inserted: result.count, snapshotId };
}
