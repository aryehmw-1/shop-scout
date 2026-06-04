import type { ProductIdentifiers } from "@/lib/identity/types";
import type { RetailerId } from "@/lib/types";

/** Normalized row after parsing any Impact-supported feed format. */
export interface NormalizedImpactRow {
  row_id: string;
  catalog_id: string;
  advertiser_name: string;
  retailer: RetailerId;
  retailer_domain: string;
  title: string;
  brand: string | null;
  description: string | null;
  product_url: string;
  affiliate_url: string;
  image_url: string | null;
  price: number;
  currency: string;
  was_price: number | null;
  availability: "in_stock" | "out_of_stock" | "unknown";
  category_raw: string | null;
  identifiers: ProductIdentifiers;
  link_type: "pdp" | "search" | "unknown";
  raw: Record<string, string>;
}

export interface ImpactIngestOptions {
  /** Local path to .csv, .tsv, or .txt (Google Merchant / Impact format) */
  filePath?: string;
  /** Max rows to process (quality-first; default 5000) */
  maxRows?: number;
  /** Catalog id label for provenance */
  catalogId?: string;
  /** Advertiser slug for provenance */
  advertiserSlug?: string;
  /** Dry-run: parse + match without persisting */
  dryRun?: boolean;
  /** Fetch from Impact API instead of file */
  useApi?: boolean;
  /** Impact catalog ID when using API */
  impactCatalogId?: string;
}
