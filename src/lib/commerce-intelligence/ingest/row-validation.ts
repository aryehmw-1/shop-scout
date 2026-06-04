import type { NormalizedImpactRow } from "./impact/types";

export interface RowValidationResult {
  valid: boolean;
  reason?: string;
}

const MIN_TITLE_LEN = 4;
const MAX_PRICE = 500_000;

export function validateImpactRow(row: NormalizedImpactRow): RowValidationResult {
  if (!row.title?.trim() || row.title.trim().length < MIN_TITLE_LEN) {
    return { valid: false, reason: "title_too_short" };
  }
  if (!row.product_url?.trim()) {
    return { valid: false, reason: "missing_product_url" };
  }
  if (row.price == null || row.price <= 0 || row.price > MAX_PRICE) {
    return { valid: false, reason: "invalid_price" };
  }
  if (!row.retailer) {
    return { valid: false, reason: "unknown_retailer" };
  }
  if (row.link_type === "search") {
    return { valid: false, reason: "search_url_not_pdp" };
  }
  return { valid: true };
}

/** In-run duplicate detection (same retailer + URL in batch). */
export function createIngestDuplicateTracker() {
  const seen = new Set<string>();
  return {
    isDuplicate(row: NormalizedImpactRow): boolean {
      const key = `${row.retailer}:${row.product_url.toLowerCase()}`;
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    },
  };
}
