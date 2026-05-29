import type { RetailerId } from "../types";

/** Normalized identifier kinds (GTIN family + merchant codes). */
export type ProductIdentifierType =
  | "upc"
  | "gtin"
  | "ean"
  | "mpn"
  | "manufacturerPartNumber"
  | "asin"
  | "sku";

export interface ProductIdentifiers {
  upc?: string;
  gtin?: string;
  ean?: string;
  mpn?: string;
  manufacturerPartNumber?: string;
  asin?: string;
  sku?: string;
}

export interface NormalizedAttributes {
  brandCanonical?: string;
  brandRaw?: string;
  colorNormalized?: string;
  sizeNormalized?: string;
  gender?: string;
  category?: string;
}

export interface ConfidenceReason {
  code: string;
  message: string;
  weight: number;
}

export interface ConfidenceBreakdown {
  matchConfidence: number;
  identityConfidence: number;
  attributeConfidence: number;
  imageConfidence: number;
  confidenceReasons: ConfidenceReason[];
}

export interface CanonicalProductRef {
  catalogId: string;
  title: string;
  brand: string;
  brandCanonical?: string;
  category: string;
  identifiers: ProductIdentifiers;
  attributes: NormalizedAttributes;
}

export interface VariantGroupRef {
  catalogGroupId: string;
  color?: string;
  colorNormalized?: string;
  identifiers: ProductIdentifiers;
}

export interface VariantSizeRef {
  catalogVariantId: string;
  sizeLabel: string;
  sizeNormalized: string;
  identifiers: ProductIdentifiers;
}

export interface ObservedListing {
  retailerId: RetailerId;
  storeTitle?: string;
  brandRaw?: string;
  identifiers?: ProductIdentifiers;
  colorRaw?: string;
  sizeRaw?: string;
  productUrl?: string;
  priceUsd?: number;
  inStock?: boolean;
  priceSource?: string;
  urlIsSearch?: boolean;
}

export interface ImageQualityMeta {
  url: string;
  width?: number;
  height?: number;
  aspectRatio?: number;
  imageQualityScore: number;
  isPlaceholder: boolean;
  isBanner: boolean;
  isThumbnail: boolean;
  /** Reserved for perceptual hash dedupe */
  imageHash?: string;
}

export interface SemanticEmbeddingRecord {
  model: string;
  dimensions: number;
  vector: number[];
  textFingerprint: string;
  updatedAt: string;
}
