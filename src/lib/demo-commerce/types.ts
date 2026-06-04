/** Demo catalog product (mirrors scrapers/base/types — keep in sync). */
export interface DemoProduct {
  id: string;
  retailer: string;
  retailer_domain: string;
  title: string;
  brand: string | null;
  category: string | null;
  price: number | null;
  currency: string;
  image_url: string | null;
  product_url: string;
  availability: "in_stock" | "out_of_stock" | "unknown";
  description: string | null;
  scraped_at: string;
  link_valid?: boolean;
  image_valid?: boolean;
  validation_checked_at?: string;
  /** 0–1 composite trust score (set at ingest or filter time). */
  quality_score?: number;
  normalized_category?: string;
  link_type?: "pdp" | "search" | "unknown";
}

export interface DemoCatalogFilters {
  q?: string;
  retailer?: string;
  category?: string;
  validOnly?: boolean;
  /** Include legacy placeholder seed rows */
  includePlaceholders?: boolean;
}

export interface DemoCatalogResult {
  products: DemoProduct[];
  total: number;
  retailers: string[];
  categories: string[];
  updatedAt: string | null;
}
