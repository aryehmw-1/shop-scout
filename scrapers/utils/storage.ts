import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DemoProduct } from "../base/types";

const DATA_DIR = join(process.cwd(), "data");
const PRODUCTS_FILE = join(DATA_DIR, "products.json");
const MANIFEST_FILE = join(DATA_DIR, "products-manifest.json");
const CHUNKS_DIR = join(DATA_DIR, "chunks");

export function getProductsPath(): string {
  return PRODUCTS_FILE;
}

export function loadProducts(): DemoProduct[] {
  const merged = [...loadChunkedProducts()];
  if (existsSync(PRODUCTS_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(PRODUCTS_FILE, "utf8")) as DemoProduct[];
      if (Array.isArray(raw)) merged.push(...raw);
    } catch {
      /* ignore corrupt file */
    }
  }
  return dedupeProducts(merged);
}

function loadChunkedProducts(): DemoProduct[] {
  if (!existsSync(CHUNKS_DIR)) return [];
  const files = readdirSync(CHUNKS_DIR).filter((f) => f.endsWith(".json"));
  const all: DemoProduct[] = [];
  for (const file of files.sort()) {
    try {
      const chunk = JSON.parse(readFileSync(join(CHUNKS_DIR, file), "utf8")) as DemoProduct[];
      if (Array.isArray(chunk)) all.push(...chunk);
    } catch {
      /* skip */
    }
  }
  return all;
}

export function saveProducts(
  products: DemoProduct[],
  opts?: { chunkSize?: number; writeMonolith?: boolean },
): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const deduped = dedupeProducts(products);
  const chunkSize = opts?.chunkSize ?? 0;

  if (chunkSize > 0) {
    mkdirSync(CHUNKS_DIR, { recursive: true });
    const chunks: DemoProduct[][] = [];
    for (let i = 0; i < deduped.length; i += chunkSize) {
      chunks.push(deduped.slice(i, i + chunkSize));
    }
    chunks.forEach((chunk, i) => {
      const name = `products-${String(i).padStart(4, "0")}.json`;
      writeFileSync(join(CHUNKS_DIR, name), JSON.stringify(chunk, null, 2));
    });
    writeFileSync(
      MANIFEST_FILE,
      JSON.stringify(
        {
          version: 1,
          updatedAt: new Date().toISOString(),
          total: deduped.length,
          chunkSize,
          chunks: chunks.map((_, i) => `chunks/products-${String(i).padStart(4, "0")}.json`),
        },
        null,
        2,
      ),
    );
  }

  if (opts?.writeMonolith !== false) {
    writeFileSync(PRODUCTS_FILE, JSON.stringify(deduped, null, 2));
  }
}

export function mergeIncremental(existing: DemoProduct[], incoming: DemoProduct[]): DemoProduct[] {
  const map = new Map<string, DemoProduct>();
  for (const p of existing) map.set(p.id, p);
  for (const p of incoming) map.set(p.id, p);
  return [...map.values()];
}

export function dedupeProducts(products: DemoProduct[]): DemoProduct[] {
  const map = new Map<string, DemoProduct>();
  for (const p of products) {
    const key = p.product_url.split("#")[0]!.toLowerCase();
    if (!map.has(key)) map.set(key, p);
  }
  return [...map.values()];
}

export function makeProductId(retailer: string, url: string): string {
  const slug = url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .slice(0, 80);
  return `${retailer}-${slug}`.toLowerCase();
}
