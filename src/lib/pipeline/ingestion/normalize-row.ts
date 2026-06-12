// Pure Bright Data row → RawProductRecord field mapping (no DB, no server-only).
// One generic mapper for every retailer; retailer-specific key names come from
// config.fieldAliases, NOT bespoke code. Always keep the untouched row in rawJson.

import type { RetailerConfig } from "./retailer-config";

export interface MappedRawRecord {
  retailer: string;
  retailerDomain: string;
  productUrl?: string;
  title?: string;
  brand?: string;
  imageUrl?: string;
  price?: number;
  availability?: string;
  upcGtin?: string;
  ean?: string;
  gtin?: string;
  modelNumber?: string;
  size?: string;
  quantity?: string;
  unitCount?: number;
  color?: string;
  variant?: string;
  category?: string;
  rawJson: string;
  processingStatus: string;
}

/** First string/number value among keys (handles stringified numbers). */
export function pick(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
    // Some datasets return image lists — take the first string element.
    if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) return v[0].trim();
  }
  return undefined;
}

export function pickNumber(row: Record<string, unknown>, keys: string[]): number | undefined {
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

/** Availability can be a boolean (IKEA `in_stock`) or a string — normalize both. */
export function pickAvailability(
  row: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "boolean") return v ? "in_stock" : "out_of_stock";
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Map one provider row to a RawProductRecord shape using generic keys plus the
 * retailer's configured field aliases. Pure + deterministic for unit testing.
 */
export function mapBrightDataRow(
  row: Record<string, unknown>,
  config: RetailerConfig,
): MappedRawRecord {
  const alias = config.fieldAliases ?? {};
  return {
    retailer: config.name,
    retailerDomain: config.domain,
    productUrl: pick(row, ["product_url", "url", "link"]),
    title: pick(row, ["title", "name", "product_name", ...(alias.title ?? [])]),
    brand: pick(row, ["brand", "manufacturer", ...(alias.brand ?? [])]),
    imageUrl: pick(row, ["image_url", "image", "main_image", "images", ...(alias.image ?? [])]),
    price: pickNumber(row, ["price", "final_price", "current_price", ...(alias.price ?? [])]),
    availability: pickAvailability(row, ["in_stock", "availability", "stock"]),
    upcGtin: pick(row, ["upc", "upc_gtin", "barcode", ...(alias.upc ?? [])]),
    ean: pick(row, ["ean"]),
    gtin: pick(row, ["gtin"]),
    // IKEA exposes both a numeric `model_number` and a dotted article `sku`.
    modelNumber: pick(row, ["model_number", "model", "mpn", "part_number", "sku"]),
    size: pick(row, ["size", "package_size", "weight"]),
    quantity: pick(row, ["quantity", "count", "pack_size"]),
    unitCount: pickNumber(row, ["unit_count", "units"]),
    color: pick(row, ["color", "colour"]),
    variant: pick(row, ["variant", "style", "configuration"]),
    category: pick(row, ["category", "department", "categories"]),
    rawJson: JSON.stringify(row),
    processingStatus: "RAW",
  };
}
