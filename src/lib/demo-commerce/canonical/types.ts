import type { TopLevelCategory } from "../taxonomy";
import type { RetailerId } from "@/lib/types";

/** Stable identity for one real-world product (Amazon-grounded metadata). */
export interface CanonicalProduct {
  canonical_id: string;
  canonical_title: string;
  canonical_image: string;
  canonical_category: TopLevelCategory | string;
  brand: string | null;
  normalized_keywords: string[];
  /** Amazon ASIN when known */
  amazon_asin?: string;
  updated_at: string;
  offers: RetailerOffer[];
}

export interface RetailerOffer {
  retailer: RetailerId;
  retailer_name: string;
  price: number;
  currency: string;
  product_url: string;
  availability: "in_stock" | "out_of_stock" | "unknown";
  confidence_score: number;
  link_type: "pdp" | "search" | "unknown";
  /** Title shown on retailer row (may differ slightly from canonical) */
  store_title?: string;
  /** Prior list price when on sale */
  list_price?: number;
}

export interface CanonicalCatalogFile {
  version: 1;
  updatedAt: string;
  products: CanonicalProduct[];
}

export interface CanonicalCatalogFilters {
  q?: string;
  category?: string;
  minOffers?: number;
}

export interface CanonicalCatalogResult {
  products: CanonicalProduct[];
  total: number;
  categories: string[];
  retailers: string[];
  updatedAt: string | null;
}
