import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  CanonicalCatalogFile,
  CanonicalCatalogFilters,
  CanonicalCatalogResult,
  CanonicalProduct,
} from "./types";
import { filterValidOffers } from "./offer-validation";

const CANONICAL_FILE = join(/* turbopackIgnore: true */ process.cwd(), "data", "canonical-products.json");

let cache: { mtime: number; file: CanonicalCatalogFile } | null = null;

function loadFile(): CanonicalCatalogFile {
  let mtime = 0;
  if (existsSync(CANONICAL_FILE)) {
    mtime = statSync(CANONICAL_FILE).mtimeMs;
  }
  if (!cache || cache.mtime !== mtime) {
    if (!existsSync(CANONICAL_FILE)) {
      cache = {
        mtime,
        file: { version: 1, updatedAt: new Date(0).toISOString(), products: [] },
      };
    } else {
      try {
        const raw = JSON.parse(readFileSync(CANONICAL_FILE, "utf8")) as CanonicalCatalogFile;
        cache = {
          mtime,
          file:
            raw?.version === 1 && Array.isArray(raw.products) ?
              raw
            : { version: 1, updatedAt: new Date(0).toISOString(), products: [] },
        };
      } catch {
        cache = {
          mtime,
          file: { version: 1, updatedAt: new Date(0).toISOString(), products: [] },
        };
      }
    }
  }
  return cache.file;
}

/** Published canonical products (≥2 valid offers after validation). */
export function getCanonicalProducts(): CanonicalProduct[] {
  const file = loadFile();
  return file.products
    .map((p) => ({
      ...p,
      offers: filterValidOffers(p.offers, p.canonical_title, p.canonical_category),
    }))
    .filter((p) => p.offers.length >= 2 && p.canonical_image?.startsWith("http"));
}

export function getCanonicalProductById(id: string): CanonicalProduct | undefined {
  return getCanonicalProducts().find((p) => p.canonical_id === id);
}

export function queryCanonicalCatalog(
  filters: CanonicalCatalogFilters = {},
): CanonicalCatalogResult {
  let products = getCanonicalProducts();

  if (filters.minOffers) {
    products = products.filter((p) => p.offers.length >= filters.minOffers!);
  }

  if (filters.category) {
    products = products.filter(
      (p) => p.canonical_category.toLowerCase() === filters.category!.toLowerCase(),
    );
  }

  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    products = products.filter(
      (p) =>
        p.canonical_title.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.normalized_keywords.some((k) => k.includes(q)),
    );
  }

  const all = getCanonicalProducts();
  const categories = [...new Set(all.map((p) => p.canonical_category))].sort();
  const retailers = [
    ...new Set(all.flatMap((p) => p.offers.map((o) => o.retailer))),
  ].sort();

  return {
    products,
    total: products.length,
    categories,
    retailers,
    updatedAt: loadFile().updatedAt,
  };
}

export function hasCanonicalCatalog(): boolean {
  return getCanonicalProducts().length > 0;
}

export function getCanonicalCatalogPath(): string {
  return CANONICAL_FILE;
}
