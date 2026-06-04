import type { RetailerId } from "@/lib/types";
import type { ProductIdentifiers } from "@/lib/identity/types";
import type { TopLevelCategory } from "@/lib/demo-commerce/taxonomy";

/** Stable commerce graph node — one real-world product identity. */
export interface CanonicalProductNode {
  canonical_id: string;
  version: number;
  /** Display / reasoning */
  title: string;
  title_normalized: string;
  brand: string | null;
  brand_canonical: string | null;
  model?: string | null;
  category: TopLevelCategory | string;
  /** Amazon-grounded metadata (not sole price authority) */
  canonical_image: string | null;
  canonical_image_source?: "amazon" | "feed" | "retailer" | "unknown";
  attributes: Record<string, string | number | boolean>;
  identifiers: ProductIdentifiers;
  keywords: string[];
  /** Cluster / variant */
  variant_group_id?: string;
  variant_label?: string;
  created_at: string;
  updated_at: string;
}

/** Ingestion provenance — deterministic, auditable. */
export type IngestionSourceType =
  | "amazon_creators_api"
  | "amazon_paapi"
  | "impact_feed"
  | "rakuten_feed"
  | "cj_feed"
  | "awin_feed"
  | "walmart_affiliate_api"
  | "ebay_browse_api"
  | "merchant_feed"
  | "cached_quote"
  | "http_lightweight"
  | "manual_qa";

export interface IngestionProvenance {
  source_type: IngestionSourceType;
  source_id: string;
  fetched_at: string;
  /** 0–1 reliability prior for this source class */
  source_reliability: number;
  raw_reference?: string;
}

/** Evidence supporting identity or offer claims (multi-source agreement). */
export interface EvidenceRecord {
  evidence_id: string;
  canonical_id: string;
  evidence_type:
    | "identifier_match"
    | "title_similarity"
    | "image_match"
    | "attribute_match"
    | "price_observation"
    | "feed_row"
    | "amazon_metadata";
  provenance: IngestionProvenance;
  payload: Record<string, unknown>;
  weight: number;
  created_at: string;
}

export type OfferValidationStatus =
  | "pending"
  | "validated"
  | "rejected"
  | "stale";

export type FreshnessTier = "fresh" | "aging" | "stale" | "expired";

/** Retailer offer — independent from canonical metadata; many per canonical. */
export interface RetailerOfferNode {
  offer_id: string;
  canonical_id: string;
  retailer: RetailerId;
  retailer_name: string;
  store_title: string;
  product_url: string;
  affiliate_url: string;
  price: number;
  currency: string;
  was_price?: number | null;
  shipping_estimate?: number | null;
  landed_cost?: number | null;
  availability: "in_stock" | "out_of_stock" | "unknown";
  seller_name?: string | null;
  link_type: "pdp" | "search" | "unknown";
  provenance: IngestionProvenance;
  validation_status: OfferValidationStatus;
  freshness_tier: FreshnessTier;
  expires_at?: string;
  /** Attached by confidence engine */
  confidence?: OfferConfidenceSnapshot;
}

export interface OfferConfidenceSnapshot {
  overall: number;
  identity: number;
  price: number;
  link: number;
  freshness: number;
  source: number;
  reasons: Array<{ code: string; message: string; weight: number }>;
}

export interface ProductIdentityConfidence {
  overall: number;
  identifier_agreement: number;
  title_consensus: number;
  brand_consistency: number;
  attribute_consistency: number;
  multi_source_agreement: number;
  reasons: Array<{ code: string; message: string; weight: number }>;
}

/** Full graph view for a canonical product (local-first JSON or DB projection). */
export interface CommerceIntelligenceGraph {
  version: 1;
  updated_at: string;
  canonical: CanonicalProductNode;
  identity_confidence: ProductIdentityConfidence;
  offers: RetailerOfferNode[];
  evidence: EvidenceRecord[];
}
