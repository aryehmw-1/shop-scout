import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CanonicalCatalogFile, CanonicalProduct } from "./types";
import { filterValidOffers } from "./offer-validation";

const CANONICAL_FILE = join(/* turbopackIgnore: true */ process.cwd(), "data", "canonical-products.json");

export type CatalogHealthStatus =
  | "healthy"
  | "partial"
  | "empty"
  | "missing"
  | "corrupt"
  | "stale";

export interface CanonicalCatalogHealth {
  status: CatalogHealthStatus;
  fileExists: boolean;
  updatedAt: string | null;
  ageHours: number | null;
  rawProductCount: number;
  publishedCount: number;
  droppedByValidation: number;
  categoryCount: number;
  retailerCount: number;
  minProductsRequired: number;
  alerts: string[];
  demoReady: boolean;
}

const DEFAULT_MIN = Number(process.env.BETA_MIN_CANONICAL_PRODUCTS ?? "5");
const STALE_HOURS = Number(process.env.BETA_CATALOG_STALE_HOURS ?? "336");

function publishedProducts(file: CanonicalCatalogFile): CanonicalProduct[] {
  return file.products
    .map((p) => ({
      ...p,
      offers: filterValidOffers(p.offers, p.canonical_title, p.canonical_category),
    }))
    .filter((p) => p.offers.length >= 2 && p.canonical_image?.startsWith("http"));
}

function loadRawFile(): CanonicalCatalogFile | null {
  const path = CANONICAL_FILE;
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as CanonicalCatalogFile;
    if (raw?.version !== 1 || !Array.isArray(raw.products)) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Catalog generation / coverage check for beta and deploy gates. */
export function assessCanonicalCatalogHealth(): CanonicalCatalogHealth {
  const path = CANONICAL_FILE;
  const fileExists = existsSync(path);
  const minProductsRequired = DEFAULT_MIN;
  const alerts: string[] = [];

  if (!fileExists) {
    return {
      status: "missing",
      fileExists: false,
      updatedAt: null,
      ageHours: null,
      rawProductCount: 0,
      publishedCount: 0,
      droppedByValidation: 0,
      categoryCount: 0,
      retailerCount: 0,
      minProductsRequired,
      alerts: ["Product inventory file is missing — run inventory seed or product ingest"],
      demoReady: false,
    };
  }

  const raw = loadRawFile();
  if (!raw) {
    return {
      status: "corrupt",
      fileExists: true,
      updatedAt: null,
      ageHours: null,
      rawProductCount: 0,
      publishedCount: 0,
      droppedByValidation: 0,
      categoryCount: 0,
      retailerCount: 0,
      minProductsRequired,
      alerts: ["Product inventory file is unreadable or invalid"],
      demoReady: false,
    };
  }

  const published = publishedProducts(raw);
  const rawCount = raw.products.length;
  const publishedCount = published.length;
  const dropped = Math.max(0, rawCount - publishedCount);
  const categories = new Set(published.map((p) => p.canonical_category));
  const retailers = new Set(published.flatMap((p) => p.offers.map((o) => o.retailer)));

  let updatedAt: string | null = raw.updatedAt ?? null;
  let ageHours: number | null = null;
  if (updatedAt) {
    ageHours = Math.round((Date.now() - new Date(updatedAt).getTime()) / 3600000);
  } else {
    try {
      const mtime = statSync(path).mtimeMs;
      ageHours = Math.round((Date.now() - mtime) / 3600000);
      updatedAt = new Date(mtime).toISOString();
    } catch {
      updatedAt = null;
    }
  }

  let status: CatalogHealthStatus = "healthy";

  if (publishedCount === 0) {
    status = rawCount > 0 ? "partial" : "empty";
    alerts.push(
      rawCount > 0 ?
        `${rawCount} raw products but 0 published after validation — check offers and images`
      : "Inventory has no products yet — run product ingest",
    );
  } else if (publishedCount < minProductsRequired) {
    status = "partial";
    alerts.push(
      `Only ${publishedCount} published products (minimum ${minProductsRequired} for launch)`,
    );
  } else if (dropped >= Math.max(5, rawCount * 0.4) && rawCount >= 10) {
    status = "partial";
    alerts.push(
      `Validation dropped ${dropped}/${rawCount} products — coverage may have regressed`,
    );
  }

  if (ageHours != null && ageHours > STALE_HOURS) {
    status = status === "healthy" ? "stale" : status;
    alerts.push(`Inventory last updated ${ageHours}h ago — consider refreshing ingest`);
  }

  if (categories.size < 2 && publishedCount >= minProductsRequired) {
    alerts.push("Low category diversity — category-focused beta may be limited");
  }

  const demoReady = publishedCount >= minProductsRequired;

  const finalStatus: CatalogHealthStatus =
    !demoReady ? status
    : status === "stale" ? "stale"
    : status === "partial" ? "partial"
    : "healthy";

  return {
    status: finalStatus,
    fileExists,
    updatedAt,
    ageHours,
    rawProductCount: rawCount,
    publishedCount,
    droppedByValidation: dropped,
    categoryCount: categories.size,
    retailerCount: retailers.size,
    minProductsRequired,
    alerts,
    demoReady,
  };
}
