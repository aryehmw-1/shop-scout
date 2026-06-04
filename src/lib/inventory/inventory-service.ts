import "server-only";

import type { Product, PriceQuote } from "@prisma/client";
import { prisma } from "../db/prisma";
import { CATALOG, type CatalogItem } from "../retailers/catalog";
import { getRetailerMeta } from "../retailers/meta";
import type { ProductOffer, ProductSearchResults, RetailerId, ShoppingIntent } from "../types";
import { storedRowToLiveQuoteFields } from "../indexing/offer-rows";
import { mergeLivePrices } from "../search/merge-live-prices";
import { compareViaCatalog } from "../search/connectors/catalog-connector";
import { finalizeSearchPrices } from "../search/price-truth";
import { finalizeResultsForUser } from "../pricing/deal-intelligence";
import { rankVerifiedInventoryCandidates } from "./verified-inventory-resolver";

type ProductWithQuotes = Product & { priceQuotes: PriceQuote[] };

export interface InventorySearchFilters {
  category?: string;
  brand?: string;
  freshOnly?: boolean;
  limit?: number;
}

export interface InventoryProductDetails {
  product: Product;
  offers: ProductOffer[];
}

export function demoInventoryFallbackEnabled(): boolean {
  const raw = process.env.USE_DEMO_INVENTORY_FALLBACK?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

function catalogItemFromProduct(product: Product): CatalogItem | null {
  const existing = CATALOG.find((item) => item.id === product.catalogId);
  if (existing) return existing;
  if (!demoInventoryFallbackEnabled()) return null;
  return {
    id: product.catalogId,
    title: product.title,
    brand: product.brand,
    size: product.sizeLabel,
    upc: product.upc ?? product.gtin ?? "",
    imageUrl: product.imageUrl ?? "",
    category: product.category,
    keywords: JSON.parse(product.keywordsJson || "[]") as string[],
    organic: product.organic,
    basePrice: product.basePriceUsd,
    unitLabel: product.unitLabel,
    slug: product.slug,
  };
}

function quoteToLiveQuote(row: PriceQuote) {
  const meta = getRetailerMeta(row.retailerId as RetailerId);
  return {
    ...storedRowToLiveQuoteFields({
      retailerId: row.retailerId,
      storeTitle: row.storeTitle,
      imageUrl: row.imageUrl,
      priceUsd: row.priceUsd,
      shippingUsd: row.shippingUsd,
      estimatedTaxUsd: row.estimatedTaxUsd,
      deliveredTotalUsd: row.deliveredTotalUsd,
      landedCostUsd: row.landedCostUsd,
      productUrl: row.productUrl,
      source: row.source,
      sourceLabel: row.sourceLabel ?? meta.name,
      providerSource: row.providerSource,
      externalOfferId: row.externalOfferId,
      sellerName: row.sellerName,
      sellerFeedbackPct: row.sellerFeedbackPct,
      sellerFeedbackScore: row.sellerFeedbackScore,
      condition: row.condition,
      returnPolicy: row.returnPolicy,
    }),
    matchConfidence: row.matchConfidence,
    identityConfidence: row.identityConfidence ?? row.matchConfidence,
    imageConfidence: row.imageConfidence ?? undefined,
    confidenceReasons: JSON.parse(row.confidenceReasonsJson || "[]") as ProductOffer["confidenceReasons"],
    fetchedAt: row.fetchedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    verifiedPersistedInventory: true,
    normalizationNote: "inventory_service_quote",
    dbSource: row.source,
  };
}

async function productToResults(
  product: ProductWithQuotes,
  intent: ShoppingIntent,
): Promise<ProductSearchResults | null> {
  const item = catalogItemFromProduct(product);
  if (!item) return null;
  const base = await compareViaCatalog(item, intent);
  const merged = mergeLivePrices(
    base,
    product.priceQuotes.map(quoteToLiveQuote),
    item,
    intent,
    "cached_quote",
    { skipRelevanceFilter: true },
  ).results;
  const finalized = finalizeSearchPrices(merged);
  return finalizeResultsForUser(finalized, item, intent, { recordStats: false });
}

export async function searchProducts(
  query: string,
  filters: InventorySearchFilters = {},
): Promise<ProductSearchResults | null> {
  const normalized = query.trim();
  if (normalized.length < 2) return null;
  const now = new Date();
  const candidates = rankVerifiedInventoryCandidates(normalized).slice(0, filters.limit ?? 5);
  const catalogIds = candidates.map((candidate) => candidate.catalogId);

  const products = await prisma.product.findMany({
    where: {
      ...(catalogIds.length ? { catalogId: { in: catalogIds } } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.brand ? { brand: { contains: filters.brand } } : {}),
    },
    include: {
      priceQuotes: {
        where: {
          ...(filters.freshOnly ? { expiresAt: { gt: now } } : {}),
          source: { in: ["scraped", "connector_api", "daily_index", "nightly_index"] },
        },
        orderBy: [{ fetchedAt: "desc" }, { landedCostUsd: "asc" }],
        take: 40,
      },
    },
    take: filters.limit ?? 5,
  });

  const ordered = catalogIds.length ?
    products.sort((a, b) => catalogIds.indexOf(a.catalogId) - catalogIds.indexOf(b.catalogId))
  : products;
  const product = ordered.find((row) => row.priceQuotes.length > 0);
  if (!product) return null;
  return productToResults(product, { query: normalized });
}

export async function getProductById(id: string): Promise<InventoryProductDetails | null> {
  const product = await prisma.product.findFirst({
    where: { OR: [{ id }, { catalogId: id }, { slug: id }] },
    include: { priceQuotes: { orderBy: { fetchedAt: "desc" }, take: 40 } },
  });
  if (!product) return null;
  const results = await productToResults(product, { query: product.title });
  return { product, offers: results?.online ?? [] };
}

export async function getProductResultsById(id: string): Promise<ProductSearchResults | null> {
  const product = await prisma.product.findFirst({
    where: { OR: [{ id }, { catalogId: id }, { slug: id }] },
    include: { priceQuotes: { orderBy: { fetchedAt: "desc" }, take: 40 } },
  });
  if (!product) return null;
  return productToResults(product, { query: product.title });
}

export async function getOffersForProduct(productId: string): Promise<ProductOffer[]> {
  return (await getProductById(productId))?.offers ?? [];
}

export async function getComparableOffers(productId: string): Promise<ProductOffer[]> {
  return getOffersForProduct(productId);
}

export async function getFreshOffers(filters: InventorySearchFilters = {}): Promise<ProductOffer[]> {
  const products = await prisma.product.findMany({
    where: {
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.brand ? { brand: { contains: filters.brand } } : {}),
    },
    include: {
      priceQuotes: {
        where: {
          expiresAt: { gt: new Date() },
          source: { in: ["scraped", "connector_api", "daily_index", "nightly_index"] },
        },
        orderBy: [{ fetchedAt: "desc" }, { landedCostUsd: "asc" }],
        take: 20,
      },
    },
    take: filters.limit ?? 10,
  });

  const batches = await Promise.all(
    products.map((product) => productToResults(product, { query: product.title })),
  );
  return batches.flatMap((results) => results?.online ?? []);
}

export const inventoryService = {
  searchProducts,
  getProductById,
  getProductResultsById,
  getOffersForProduct,
  getComparableOffers,
  getFreshOffers,
};
