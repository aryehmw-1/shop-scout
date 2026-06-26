// Bright Data + Product Verification Pipeline — shared types.
//
// Lifecycle:  RAW → CHECKED → MATCHED → VERIFIED → PUBLISHED
// Side states: STALE, NEEDS_REVIEW, REJECTED
//
// Nothing reaches users until PUBLISHED. These unions are the single source of
// truth for status strings stored in Postgres (see prisma/schema.prisma).

export const PROCESSING_STATUSES = [
  "RAW",
  "CHECKED",
  "MATCHED",
  "VERIFIED",
  "PUBLISHED",
  "STALE",
  "NEEDS_REVIEW",
  "REJECTED",
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const VALIDATION_STATUSES = ["approved", "needs_review", "rejected"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const INPUT_TYPES = ["url", "keyword", "category", "upc", "sku"] as const;
export type RetailerInputType = (typeof INPUT_TYPES)[number];

/** Coarse category buckets that drive category-specific validation rules. */
export type ProductCategoryKind =
  | "grocery"
  | "household"
  | "electronics"
  | "apparel"
  | "general";

/**
 * The normalized, comparable view of a listing — produced from a raw record or a
 * catalog product. Everything the matcher / scorer reasons over lives here.
 */
export interface NormalizedListing {
  retailer: string;
  retailerDomain?: string;
  productUrl?: string;
  imageUrl?: string;
  title: string;
  titleNormalized: string;
  brand?: string;
  brandNormalized?: string;
  price?: number;
  availability?: string;
  // Identifiers (most authoritative first)
  upc?: string;
  gtin?: string;
  ean?: string;
  modelNumber?: string;
  /** Manufacturer part number ONLY (retailer SKUs excluded) — feeds the
   *  cross-retailer `model:` identity tier. Set via normalizeManufacturerModel. */
  modelNumberNormalized?: string;
  /** A retailer-specific SKU (ASIN / Walmart item id / Target TCIN) detected in
   *  the model field. Preserved for catalog identity & refresh, but kept OUT of
   *  the manufacturer-model matching key. */
  retailerSku?: string;
  // Quantity / size
  size?: string;
  sizeNormalized?: string; // e.g. "92 oz"
  sizeValue?: number; // 92
  sizeUnit?: string; // "oz"
  packCount?: number; // 12 for "12-pack" / "pack of 12"
  unitCount?: number;
  // Variant
  color?: string;
  colorNormalized?: string;
  variant?: string;
  variantNormalized?: string;
  category?: string;
  categoryKind: ProductCategoryKind;
}

export type MatchTier =
  | "upc_gtin_ean"
  | "model_number"
  | "brand_title_size"
  | "image_similarity"
  | "ai_assisted"
  | "none";

export interface MatchResult {
  isMatch: boolean;
  tier: MatchTier;
  /** Hard, non-overridable conflicts (different UPC, size, variant, …). */
  criticalDifferences: string[];
  reasons: string[];
}

export interface ScoreResult {
  score: number; // 0–100, clamped
  reasons: string[];
  /** A hard reject overrides any positive points. */
  hardReject: boolean;
}

export interface ValidationOutcome {
  processingStatus: ProcessingStatus;
  validationStatus: ValidationStatus;
  confidenceScore: number;
  reasons: string[];
  aiUsed: boolean;
  aiResult?: AiMatchResult;
}

/** Strict JSON contract returned by the AI-assisted validator. */
export interface AiMatchResult {
  same_product: boolean;
  confidence: number; // 0–100
  reason: string;
  critical_differences: string[];
  fields_checked: string[];
}
