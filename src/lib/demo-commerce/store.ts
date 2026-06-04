import "server-only";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DemoCatalogFilters, DemoCatalogResult, DemoProduct } from "./types";
import { passesQualityThreshold, scoreProductQuality } from "./quality";

const PLACEHOLDER_RE =
  /sample product|demo brand|placehold\.co/i;

/** Products suitable for public catalog (high-confidence listings only). */
export function isPublishedProduct(p: DemoProduct): boolean {
  if (PLACEHOLDER_RE.test(p.title) || PLACEHOLDER_RE.test(p.description ?? "")) return false;
  if (p.brand === "Demo Brand") return false;
  if (!p.image_url?.startsWith("http")) return false;
  if (p.price == null || p.price <= 0) return false;
  if (p.link_valid === false || p.image_valid === false) return false;
  return passesQualityThreshold(p);
}

/** Attach quality metadata for API responses. */
export function withQualityMetadata(p: DemoProduct): DemoProduct {
  const s = scoreProductQuality(p);
  return {
    ...p,
    category: s.normalizedCategory,
    quality_score: s.overall,
    normalized_category: s.normalizedCategory,
    link_type: s.linkType,
  };
}

export function getPublishedProducts(): DemoProduct[] {
  return getDemoProducts().filter(isPublishedProduct);
}

const DATA_DIR = join(process.cwd(), "data");
const PRODUCTS_FILE = join(DATA_DIR, "products.json");
const CHUNKS_DIR = join(DATA_DIR, "chunks");

let cache: { mtime: number; products: DemoProduct[] } | null = null;

function loadAllProducts(): DemoProduct[] {
  const products: DemoProduct[] = [];

  if (existsSync(PRODUCTS_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(PRODUCTS_FILE, "utf8")) as DemoProduct[];
      if (Array.isArray(raw)) products.push(...raw);
    } catch {
      /* empty */
    }
  }

  if (existsSync(CHUNKS_DIR)) {
    for (const file of readdirSync(CHUNKS_DIR).filter((f) => f.endsWith(".json"))) {
      try {
        const chunk = JSON.parse(
          readFileSync(join(CHUNKS_DIR, file), "utf8"),
        ) as DemoProduct[];
        if (Array.isArray(chunk)) products.push(...chunk);
      } catch {
        /* skip */
      }
    }
  }

  const seen = new Set<string>();
  return products.filter((p) => {
    const k = p.id || p.product_url;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function getDemoProducts(): DemoProduct[] {
  let mtime = 0;
  if (existsSync(PRODUCTS_FILE)) {
    mtime = statSync(PRODUCTS_FILE).mtimeMs;
  }
  if (!cache || cache.mtime !== mtime) {
    cache = { mtime, products: loadAllProducts() };
  }
  return cache.products;
}

export function getDemoProductById(id: string): DemoProduct | undefined {
  return getDemoProducts().find((p) => p.id === id);
}

export function queryDemoCatalog(filters: DemoCatalogFilters = {}): DemoCatalogResult {
  const all = getDemoProducts();
  let products = filters.includePlaceholders ? all : getPublishedProducts();

  if (filters.validOnly) {
    products = products.filter((p) => p.link_valid !== false && p.image_valid !== false);
  }

  if (filters.retailer) {
    products = products.filter((p) => p.retailer === filters.retailer);
  }

  if (filters.category) {
    products = products.filter(
      (p) => p.category?.toLowerCase() === filters.category!.toLowerCase(),
    );
  }

  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    products = products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.retailer.toLowerCase().includes(q),
    );
  }

  const base = filters.includePlaceholders ? all : getPublishedProducts();
  const retailers = [...new Set(base.map((p) => p.retailer))].sort();
  const categories = [
    ...new Set(
      base
        .map((p) => p.category)
        .filter((c): c is string => Boolean(c)),
    ),
  ].sort();

  let updatedAt: string | null = null;
  if (existsSync(PRODUCTS_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(PRODUCTS_FILE, "utf8")) as DemoProduct[];
      const latest = raw.reduce(
        (max, p) => (p.scraped_at > max ? p.scraped_at : max),
        "",
      );
      updatedAt = latest || null;
    } catch {
      updatedAt = null;
    }
  }

  return {
    products: products.map(withQualityMetadata),
    total: products.length,
    retailers,
    categories,
    updatedAt,
  };
}
