/** Normalized commerce demo product (JSON store + frontend). */
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
  /** Set by link/image validation pass */
  link_valid?: boolean;
  image_valid?: boolean;
  validation_checked_at?: string;
  quality_score?: number;
  normalized_category?: string;
  link_type?: "pdp" | "search" | "unknown";
}

export interface ScrapeContext {
  retailer: string;
  retailer_domain: string;
  /** Requests per second cap for this retailer */
  rateLimitRps: number;
  timeoutMs: number;
  maxRetries: number;
  userAgent: string;
}

export interface ScrapeResult {
  products: DemoProduct[];
  errors: string[];
  urlsAttempted: number;
  urlsSucceeded: number;
}

export interface RetailerScraper {
  readonly retailer: string;
  readonly domains: string[];
  discoverProductUrls(ctx: ScrapeContext, limit: number): Promise<string[]>;
  scrapeProductUrls(ctx: ScrapeContext, urls: string[]): Promise<ScrapeResult>;
}

export interface IngestOptions {
  retailers?: string[];
  maxPerRetailer?: number;
  concurrency?: number;
  discoverLimit?: number;
  validateLinks?: boolean;
  incremental?: boolean;
  chunkSize?: number;
}

export interface IngestReport {
  startedAt: string;
  completedAt: string;
  totalProducts: number;
  byRetailer: Record<string, number>;
  errors: string[];
  skippedRetailers: string[];
}
