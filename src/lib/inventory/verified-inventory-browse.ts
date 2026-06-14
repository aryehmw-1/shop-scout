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

export interface BrowseOptions {
  /** Page size (default 48). */
  limit?: number;
  /** Offset for pagination (default 0). */
  offset?: number;
  /** Optional case-insensitive title/brand search (uses the pg_trgm index). */
  query?: string;
}

/**
 * Paginated inventory browse. PRODUCT-level pagination (not quote-level) so we
 * load one page of products + only their quotes — never the full ~13k catalog
 * / ~20k quotes at once. Search runs in the DB (trgm-indexed ILIKE), not in the
 * browser. `totalProducts` is the full count so the UI can show "X of N".
 */
export async function loadVerifiedInventoryBrowse(
  mode: VerifiedBrowseMode = "all",
  opts: BrowseOptions = {},
): Promise<VerifiedBrowseResult> {
  const now = new Date();
  const limit = Math.min(Math.max(opts.limit ?? 48, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = opts.query?.trim();

  const liveQuote = {
    providerSource: "bright_data",
    source: { in: VERIFIED_SOURCES },
    expiresAt: { gt: now },
  };

  // Products that are public AND carry a live Bright-Data offer. Optional search
  // and (for qa_approved mode) an approved QA review.
  const where: Record<string, unknown> = {
    published: true,
    validationStatus: "approved",
    priceQuotes: {
      some: mode === "qa_approved" ? { ...liveQuote, qaReview: { status: "approved" } } : liveQuote,
    },
    ...(q
      ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }] }
      : {}),
  };

  const [total, productRows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ category: "asc" }, { title: "asc" }],
      take: limit,
      skip: offset,
      include: {
        priceQuotes: { where: liveQuote, orderBy: { priceUsd: "asc" }, include: { qaReview: true } },
      },
    }),
  ]);

  const products: VerifiedBrowseProduct[] = [];
  for (const product of productRows) {
    const quotes = product.priceQuotes;
    if (!quotes.length) continue;
    const catalog = catalogFor(product.catalogId);
    const qaApproved = quotes.some((qq) => qq.qaReview?.status === "approved");
    const qaPending = quotes.some((qq) => !qq.qaReview || qq.qaReview.status === "pending");
    const best = quotes[0]!;
    const prices = quotes.map((qq) => qq.priceUsd);

    products.push({
      catalogId: product.catalogId,
      title: catalog?.title ?? product.title,
      brand: catalog?.brand ?? product.brand,
      category: catalog?.category ?? product.category,
      size: catalog?.size ?? product.sizeLabel,
      imageUrl: (catalog ? imageForProduct(catalog) : "") || product.imageUrl || best.imageUrl || "",
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      quoteCount: quotes.length,
      retailers: [...new Set(quotes.map((qq) => qq.retailerId))],
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

  return {
    generatedAt: new Date().toISOString(),
    mode,
    totalProducts: total,
    totalQuotes: products.reduce((n, p) => n + p.quoteCount, 0),
    qaApprovedCount: products.filter((p) => p.qaApproved).length,
    products,
  };
}
