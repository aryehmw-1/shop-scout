// No "server-only" here: this module is pure types + helpers (no secrets, no DB).
// The provider adapters that actually fetch (bright-data / official-api) are
// server-only; this seam is safe to reference anywhere.
import type { RetailerSource } from "@prisma/client";
import type { SourceOperation } from "./operations";

/**
 * Ingestion source mode for a retailer. Bright Data is just one SOURCE — a
 * retailer can be switched to its official API (or turned off) WITHOUT changing
 * any of the verification / search / publishing code downstream. The adapter is
 * the only seam that knows where raw rows come from.
 */
export type RetailerSourceMode = "bright_data" | "official_api" | "disabled";

export const RETAILER_SOURCE_MODES: readonly RetailerSourceMode[] = [
  "bright_data",
  "official_api",
  "disabled",
];

export function isRetailerSourceMode(v: string): v is RetailerSourceMode {
  return (RETAILER_SOURCE_MODES as readonly string[]).includes(v);
}

export interface RawFetchResult {
  /** Provider rows, untouched (the same shape ingest persists to rawJson). */
  rows: Record<string, unknown>[];
  /** Optional provider job id (e.g. Bright Data snapshot id) for diagnostics. */
  snapshotId?: string;
}

export interface SearchProductsOptions {
  /** Which source operation to run (keyword_search | url_lookup | upc_lookup). */
  operation?: SourceOperation;
  /** ZIP for localized pricing/availability (Bright Data input field). */
  zipcode?: string;
  /** Language hint (url_lookup uses this). */
  language?: string;
  /** Cap on offers/rows to keep (top-retailers-first stores only the best few). */
  limit?: number;
}

/**
 * A retailer ingestion adapter returns raw provider rows for a product query.
 * Implementations: Bright Data (live) and Official API (per-retailer, added
 * incrementally). The rest of the pipeline only sees `RawFetchResult`, so the
 * underlying source is fully swappable.
 *
 * This is the requested generic shape:  source.searchProducts(query, options).
 */
export interface RetailerIngestionAdapter {
  readonly mode: RetailerSourceMode;
  readonly retailer: string;
  searchProducts(query: string, options?: SearchProductsOptions): Promise<RawFetchResult>;
}

/** Source whose mode is `disabled` — yields nothing, never calls a provider. */
export class DisabledAdapter implements RetailerIngestionAdapter {
  readonly mode = "disabled" as const;
  constructor(readonly retailer: string) {}
  async searchProducts(): Promise<RawFetchResult> {
    return { rows: [] };
  }
}

/** Read a retailer source's mode with a safe default. */
export function sourceModeOf(source: Pick<RetailerSource, "sourceMode">): RetailerSourceMode {
  return isRetailerSourceMode(source.sourceMode) ? source.sourceMode : "bright_data";
}
