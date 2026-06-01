import type { RetailerId } from "../types";
import {
  isGoldenPathOnly,
  isGoldenPathRetailer,
} from "../retailers/fetch-strategy";
import seed from "./seed-products.json";

/**
 * D — curated, controlled ingestion seed set. Highly standardized
 * grocery/household products used to validate normalization quality, match
 * confidence, retailer consistency, and UI usefulness BEFORE any broad
 * crawling. Source of truth is seed-products.json (also read by scripts).
 */
export interface SeedProduct {
  id: string;
  query: string;
  brand: string;
  category: string;
  canonical: string;
  keywords: string[];
  commonSizes: string[];
  retailers: RetailerId[];
}

const SEED_PRODUCTS = (seed.products as SeedProduct[]).slice();

export function getSeedProducts(): SeedProduct[] {
  return SEED_PRODUCTS.slice();
}

export function getSeedProduct(id: string): SeedProduct | undefined {
  return SEED_PRODUCTS.find((p) => p.id === id);
}

export function seedCategories(): string[] {
  return [...new Set(SEED_PRODUCTS.map((p) => p.category))].sort();
}

/**
 * Retailers referenced by the seed set, filtered to golden-path retailers when
 * golden-path-only mode is enabled (controlled ingestion). Ordered so stable
 * retailers come first.
 */
export function seedRetailers(): RetailerId[] {
  const all = [...new Set(SEED_PRODUCTS.flatMap((p) => p.retailers))];
  const filtered = isGoldenPathOnly() ? all.filter(isGoldenPathRetailer) : all;
  return filtered.sort((a, b) => Number(isGoldenPathRetailer(b)) - Number(isGoldenPathRetailer(a)));
}

/** Per-product retailer targets, respecting golden-path-only mode. */
export function seedProductTargets(): Array<{ product: SeedProduct; retailers: RetailerId[] }> {
  return SEED_PRODUCTS.map((product) => ({
    product,
    retailers: isGoldenPathOnly()
      ? product.retailers.filter(isGoldenPathRetailer)
      : product.retailers,
  })).filter((t) => t.retailers.length > 0);
}
