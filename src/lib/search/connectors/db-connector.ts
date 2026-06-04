import "server-only";

import type { PriceConnector } from "../types";
import type { ProductSearchResults, ShoppingIntent } from "../../types";
import { prisma } from "../../db/prisma";
import { rankVerifiedInventoryCandidates } from "../../inventory/verified-inventory-resolver";
import { CATALOG, type CatalogItem } from "../../retailers/catalog";
import { getRetailerMeta } from "../../retailers/meta";
import { storedRowToLiveQuoteFields } from "../../indexing/offer-rows";
import { mergeLivePrices } from "../merge-live-prices";
import { compareViaCatalog } from "./catalog-connector";
import { finalizeSearchPrices } from "../price-truth";
import { finalizeResultsForUser } from "../../pricing/deal-intelligence";
import type { ProductOffer, RetailerId } from "../../types";
import type { Product, PriceQuote } from "@prisma/client";

type ProductWithQuotes = Product & { priceQuotes: PriceQuote[] };

function catalogItemFromProduct(product: Product): CatalogItem | null {
  const existing = CATALOG.find((item) => item.id === product.catalogId);
  if (existing) return existing;
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
    normalizationNote: "db_connector_quote",
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

async function queryDb(intent: ShoppingIntent): Promise<ProductSearchResults | null> {
  const normalized = intent.query.trim();
  if (normalized.length < 2) return null;

  const now = new Date();
  const candidates = rankVerifiedInventoryCandidates(normalized).slice(0, 5);
  const catalogIds = candidates.map((c) => c.catalogId);

  const products = await prisma.product.findMany({
    where: {
      ...(catalogIds.length ? { catalogId: { in: catalogIds } } : {}),
      ...(intent.category ? { category: intent.category } : {}),
    },
    include: {
      priceQuotes: {
        where: {
          expiresAt: { gt: now },
          source: { in: ["scraped", "connector_api", "daily_index", "nightly_index", "amazon_paapi"] },
        },
        orderBy: [{ fetchedAt: "desc" }, { landedCostUsd: "asc" }],
        take: 40,
      },
    },
    take: 5,
  });

  const ordered = catalogIds.length
    ? products.sort((a, b) => catalogIds.indexOf(a.catalogId) - catalogIds.indexOf(b.catalogId))
    : products;

  const product = ordered.find((row) => row.priceQuotes.length > 0);
  if (!product) return null;

  return productToResults(product, intent);
}

/** DB-backed connector: queries live PriceQuote rows joined with Product.
 *  Priority 1 so it runs before the catalog fallback (priority 10).
 *  Returns empty results (no throw) when DB has no matching quotes. */
export const dbConnector: PriceConnector = {
  id: "db",
  priority: 1,

  supports(): boolean {
    return true;
  },

  async search(intent: ShoppingIntent): Promise<ProductSearchResults> {
    try {
      const results = await queryDb(intent);
      if (results) return results;
    } catch (e) {
      console.error("[db-connector] query failed, falling back", e);
    }
    return { local: [], online: [], zipCode: intent.zipCode ?? "78701", compareMode: false };
  },
};
