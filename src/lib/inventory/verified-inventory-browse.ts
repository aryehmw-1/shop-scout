/**
 * Verified inventory browse — persisted quotes with optional QA filter.
 */

import { prisma } from "../db/prisma";
import { CATALOG } from "../retailers/catalog";
import { imageForProduct } from "../catalog-images";

const VERIFIED_SOURCES = ["scraped", "connector_api", "daily_index", "nightly_index"];

export type VerifiedBrowseMode = "all" | "qa_approved" | "persisted";

export interface VerifiedBrowseProduct {
  catalogId: string;
  title: string;
  brand: string;
  category: string;
  imageUrl: string;
  size: string;
  minPrice: number;
  maxPrice: number;
  quoteCount: number;
  retailers: string[];
  qaApproved: boolean;
  qaPending: boolean;
  bestQuote: {
    priceUsd: number;
    retailerId: string;
    productUrl: string;
    matchConfidence: number;
    fetchedAt: string;
  };
}

export interface VerifiedBrowseResult {
  generatedAt: string;
  mode: VerifiedBrowseMode;
  totalProducts: number;
  totalQuotes: number;
  qaApprovedCount: number;
  products: VerifiedBrowseProduct[];
}

function catalogFor(catalogId: string) {
  return CATALOG.find((c) => c.id === catalogId);
}

export async function loadVerifiedInventoryBrowse(
  mode: VerifiedBrowseMode = "all",
): Promise<VerifiedBrowseResult> {
  const now = new Date();

  const rows = await prisma.priceQuote.findMany({
    where: {
      source: { in: VERIFIED_SOURCES },
      expiresAt: { gt: now },
    },
    include: {
      product: true,
      qaReview: true,
    },
    orderBy: [{ product: { category: "asc" } }, { priceUsd: "asc" }],
  });

  const byProduct = new Map<
    string,
    {
      catalogId: string;
      title: string;
      brand: string;
      category: string;
      size: string;
      quotes: typeof rows;
    }
  >();

  for (const row of rows) {
    const catalogId = row.product.catalogId;
    const catalog = catalogFor(catalogId);
    const existing = byProduct.get(catalogId);
    if (existing) {
      existing.quotes.push(row);
    } else {
      byProduct.set(catalogId, {
        catalogId,
        title: catalog?.title ?? row.product.title,
        brand: catalog?.brand ?? row.product.brand,
        category: catalog?.category ?? row.product.category,
        size: catalog?.size ?? row.product.sizeLabel,
        quotes: [row],
      });
    }
  }

  const products: VerifiedBrowseProduct[] = [];

  for (const entry of byProduct.values()) {
    const qaApproved = entry.quotes.some((q) => q.qaReview?.status === "approved");
    const qaPending = entry.quotes.some(
      (q) => !q.qaReview || q.qaReview.status === "pending",
    );

    if (mode === "qa_approved" && !qaApproved) continue;

    const best = entry.quotes[0]!;
    const prices = entry.quotes.map((q) => q.priceUsd);
    const catalog = catalogFor(entry.catalogId);

    products.push({
      catalogId: entry.catalogId,
      title: entry.title,
      brand: entry.brand,
      category: entry.category,
      size: entry.size,
      // Prefer the static catalog image; fall back to the DB product/offer image
      // for DB-only products (e.g. IKEA, ingested via the Bright Data pipeline).
      imageUrl:
        (catalog ? imageForProduct(catalog) : "") ||
        best.product.imageUrl ||
        best.imageUrl ||
        "",
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      quoteCount: entry.quotes.length,
      retailers: [...new Set(entry.quotes.map((q) => q.retailerId))],
      qaApproved,
      qaPending,
      bestQuote: {
        priceUsd: best.priceUsd,
        retailerId: best.retailerId,
        productUrl: best.productUrl,
        matchConfidence: best.matchConfidence,
        fetchedAt: best.fetchedAt.toISOString(),
      },
    });
  }

  products.sort((a, b) => {
    if (a.qaApproved !== b.qaApproved) return a.qaApproved ? -1 : 1;
    return a.minPrice - b.minPrice;
  });

  return {
    generatedAt: new Date().toISOString(),
    mode,
    totalProducts: products.length,
    totalQuotes: rows.length,
    qaApprovedCount: products.filter((p) => p.qaApproved).length,
    products,
  };
}
