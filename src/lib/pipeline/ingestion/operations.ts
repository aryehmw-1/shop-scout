// Source operations — the SAME retailer can be sourced three ways, and the
// OPERATION (not a separate scraper) decides the Bright Data input payload.
// Generic: any retailer can declare any of these operations if Bright Data (or a
// future official API) supports them.
//
// Priority order for Homivion sourcing:
//   1. keyword_search → find/import NEW products
//   2. url_lookup     → refresh KNOWN product pages
//   3. upc_lookup     → exact-match the same item ACROSS retailers

import type { ProductCategoryKind } from "../types";

export type SourceOperation =
  | "keyword_search"
  | "url_lookup"
  | "upc_lookup"
  | "sku_lookup";

/** Default attempt order (keyword → url → identity[upc/sku]). */
export const OPERATION_PRIORITY: readonly SourceOperation[] = [
  "keyword_search",
  "url_lookup",
  "upc_lookup",
  "sku_lookup",
];

/** What the ingestion pipeline is trying to do → which operation to use. */
export type IngestIntent = "import" | "refresh" | "cross_retailer_match";

export function operationForIntent(intent: IngestIntent): SourceOperation {
  switch (intent) {
    case "refresh":
      return "url_lookup";
    case "cross_retailer_match":
      return "upc_lookup";
    case "import":
    default:
      return "keyword_search";
  }
}

/**
 * A retailer's config for one operation. `discoverBy` maps to the Bright Data
 * trigger semantics: `null` = Collect by URL (no discover type), otherwise
 * Discover by <keyword|upc>. `inputFields` lists the payload keys IN ORDER; the
 * first non-context field (keyword/url/upc) receives the query value.
 */
export interface BrightDataOperation {
  /** Bright Data discover_by value; null = Collect-by-URL (no discover type). */
  discoverBy: "keyword" | "upc" | "sku" | null;
  inputFields: readonly string[];
}

export interface OperationInputContext {
  zipcode?: string;
  language?: string;
  categoryKind?: ProductCategoryKind;
}

const CONTEXT_FIELDS = new Set(["zipcode", "language"]);

/**
 * Build the Bright Data input row for an operation. Pure + deterministic so it
 * can be unit-tested. The single non-context field (keyword | url | upc) gets the
 * query value; zipcode/language are filled from context when the operation
 * declares them.
 */
export function buildOperationInput(
  op: BrightDataOperation,
  query: string,
  ctx: OperationInputContext = {},
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const field of op.inputFields) {
    if (field === "zipcode") {
      if (ctx.zipcode) row.zipcode = ctx.zipcode;
    } else if (field === "language") {
      row.language = ctx.language ?? "en";
    } else if (!CONTEXT_FIELDS.has(field)) {
      // Primary field — keyword | url | upc.
      row[field] = query;
    }
  }
  return row;
}
