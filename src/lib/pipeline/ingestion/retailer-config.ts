// The ONE place retailer-specific config lives. Everything else in ingestion is
// generic. Adding or changing a retailer is a config edit here (plus, for Bright
// Data, a dataset id in an env var) — never a new scraper module.
//
// Deliberately config, not code: dataset ids come from env vars (so no ids are
// hardcoded), affiliate behavior is delegated to the central affiliate builder,
// and normalization quirks are declared as field aliases the generic ingester
// reads. Bright Data is just the default source; any retailer can flip to
// official_api or disabled without touching the pipeline.

import type { RetailerSourceMode } from "./adapter";
import type { SourcingRetailer } from "../sourcing/retailer-strategy";
import type { BrightDataOperation, SourceOperation } from "./operations";

export interface RetailerConfig {
  retailer: SourcingRetailer;
  name: string;
  domain: string;
  /** What input the source expects for a search (shapes the Bright Data payload). */
  inputType: "keyword" | "url" | "category" | "upc" | "sku";
  /** Env var holding this retailer's Bright Data dataset id (kept out of code). */
  brightDataDatasetEnv?: string;
  /**
   * Per-operation Bright Data config. ONE retailer, ONE dataset, multiple
   * operations (keyword_search / url_lookup / upc_lookup) — the operation, not a
   * separate scraper, decides the input payload. Generic: any retailer can
   * declare these once Bright Data supports them.
   */
  operations?: Partial<Record<SourceOperation, BrightDataOperation>>;
  /** Affiliate monetization is required before any public link is shown. */
  affiliateRequired: boolean;
  /** Per-retailer raw-field aliases merged into the generic field extraction. */
  fieldAliases?: Partial<Record<"title" | "price" | "image" | "upc" | "brand", string[]>>;
  /** Env vars that must exist before this retailer can use official_api. */
  officialApiCredentialEnvVars?: string[];
  /** Default ingestion source when no DB override exists. */
  defaultSourceMode: RetailerSourceMode;
  enabled: boolean;
}

const CONFIGS: Record<SourcingRetailer, RetailerConfig> = {
  amazon: {
    retailer: "amazon",
    name: "Amazon",
    domain: "amazon.com",
    inputType: "keyword",
    brightDataDatasetEnv: "BRIGHT_DATA_DATASET_AMAZON",
    // One Amazon dataset (gd_l7q7dkf244hwjntr0), three Bright Data operations.
    operations: {
      // Discover by keyword — find/import new products.
      keyword_search: { discoverBy: "keyword", inputFields: ["keyword", "zipcode"] },
      // Collect by URL — refresh known product pages.
      url_lookup: { discoverBy: null, inputFields: ["url", "zipcode", "language"] },
      // Discover by UPC — exact match across retailers.
      upc_lookup: { discoverBy: "upc", inputFields: ["upc", "zipcode"] },
    },
    affiliateRequired: true,
    officialApiCredentialEnvVars: [
      "AMAZON_PA_API_ACCESS_KEY",
      "AMAZON_PA_API_SECRET_KEY",
      "AMAZON_PA_API_PARTNER_TAG",
    ],
    defaultSourceMode: "bright_data",
    enabled: true,
  },
  ebay: {
    retailer: "ebay",
    name: "eBay",
    domain: "ebay.com",
    inputType: "keyword",
    brightDataDatasetEnv: "BRIGHT_DATA_DATASET_EBAY",
    affiliateRequired: true,
    // We already have eBay API creds — eBay is a strong candidate to flip to
    // official_api first.
    officialApiCredentialEnvVars: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"],
    defaultSourceMode: "bright_data",
    enabled: true,
  },
  walmart: {
    retailer: "walmart",
    name: "Walmart",
    domain: "walmart.com",
    inputType: "keyword",
    brightDataDatasetEnv: "BRIGHT_DATA_DATASET_WALMART",
    // One Walmart dataset (gd_l95fol7l1ru6rlo116), three Bright Data operations —
    // same generic architecture as Amazon, config only, no Walmart-specific code.
    operations: {
      // Discover by keyword — find/import new products.
      keyword_search: { discoverBy: "keyword", inputFields: ["keyword", "zipcode"] },
      // Collect by URL — refresh known product pages.
      url_lookup: { discoverBy: null, inputFields: ["url", "zipcode", "language"] },
      // Discover by SKU — exact match by Walmart item id.
      sku_lookup: { discoverBy: "sku", inputFields: ["sku", "zipcode"] },
    },
    affiliateRequired: false,
    defaultSourceMode: "bright_data",
    enabled: true,
  },
  target: {
    retailer: "target",
    name: "Target",
    domain: "target.com",
    inputType: "keyword",
    brightDataDatasetEnv: "BRIGHT_DATA_DATASET_TARGET",
    // One Target dataset (gd_ltppk5mx2lp0v1k0vo), three Bright Data operations —
    // same generic architecture as Amazon/Walmart, config only, no Target code.
    operations: {
      // Discover by keywords — import new Target products overnight.
      keyword_search: { discoverBy: "keyword", inputFields: ["keyword", "zipcode"] },
      // Collect by URL — refresh known Target product pages.
      url_lookup: { discoverBy: null, inputFields: ["url", "zipcode"] },
      // Discover by UPC — exact match across retailers.
      upc_lookup: { discoverBy: "upc", inputFields: ["upc", "zipcode"] },
    },
    affiliateRequired: false,
    defaultSourceMode: "bright_data",
    enabled: true,
  },
  bestbuy: {
    retailer: "bestbuy",
    name: "Best Buy",
    domain: "bestbuy.com",
    inputType: "keyword",
    brightDataDatasetEnv: "BRIGHT_DATA_DATASET_BESTBUY",
    affiliateRequired: false,
    defaultSourceMode: "bright_data",
    enabled: true,
  },
  homedepot: {
    retailer: "homedepot",
    name: "Home Depot",
    domain: "homedepot.com",
    inputType: "keyword",
    brightDataDatasetEnv: "BRIGHT_DATA_DATASET_HOMEDEPOT",
    affiliateRequired: false,
    defaultSourceMode: "bright_data",
    enabled: true,
  },
  costco: {
    retailer: "costco",
    name: "Costco",
    domain: "costco.com",
    inputType: "keyword",
    brightDataDatasetEnv: "BRIGHT_DATA_DATASET_COSTCO",
    affiliateRequired: false,
    // Optional/less reliable — off by default until enabled.
    defaultSourceMode: "disabled",
    enabled: false,
  },
};

export function getRetailerConfig(retailer: SourcingRetailer): RetailerConfig {
  return CONFIGS[retailer];
}

/** Synthesize a default operation from `inputType` for retailers that haven't
 *  declared explicit operations yet. Keeps the system generic. */
function fallbackOperation(
  config: RetailerConfig,
  operation: SourceOperation,
): BrightDataOperation {
  switch (operation) {
    case "url_lookup":
      return { discoverBy: null, inputFields: ["url", "zipcode"] };
    case "upc_lookup":
      return { discoverBy: "upc", inputFields: ["upc", "zipcode"] };
    case "keyword_search":
    default: {
      const primary = config.inputType === "keyword" ? "keyword" : config.inputType;
      return { discoverBy: "keyword", inputFields: [primary, "zipcode"] };
    }
  }
}

/**
 * Resolve a retailer's config for one operation, or null when the retailer does
 * not support it. Uses the explicit `operations` map when present, otherwise a
 * generic fallback derived from `inputType`.
 */
export function getRetailerOperation(
  config: RetailerConfig,
  operation: SourceOperation,
): BrightDataOperation | null {
  const explicit = config.operations?.[operation];
  if (explicit) return explicit;
  // If a retailer declares ANY operations, only honor the declared ones.
  if (config.operations) return null;
  return fallbackOperation(config, operation);
}

export function allRetailerConfigs(): RetailerConfig[] {
  return Object.values(CONFIGS);
}

/** Resolve the Bright Data dataset id for a retailer from its env var. */
export function brightDataDatasetIdFor(config: RetailerConfig): string | undefined {
  return config.brightDataDatasetEnv
    ? process.env[config.brightDataDatasetEnv]?.trim() || undefined
    : undefined;
}
