import { prisma } from "../db/prisma";
import { mergeLivePrices } from "../search/merge-live-prices";
import { runSearchWithLivePricing } from "../search/live-pricing";
import { fetchAmazonLiveQuotes } from "../search/providers/amazon-paapi-server";
import { isAmazonPaapiConfigured } from "../search/providers/amazon-paapi-config";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductSearchResults, ShoppingIntent } from "../types";
import { startOfNextLocalDay } from "./expiry";
import { offersToStoredRows } from "./offer-rows";
import { shuffleInPlace } from "./shuffle";

const NIGHTLY_SOURCE = "nightly_index";

export async function purgeExpiredPriceQuotes(): Promise<number> {
  const result = await prisma.priceQuote.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

export async function clearNightlyQuotesForProduct(productId: string): Promise<void> {
  await prisma.priceQuote.deleteMany({
    where: { productId, source: NIGHTLY_SOURCE },
  });
}

export async function persistNightlySearchResults(
  catalogId: string,
  results: ProductSearchResults,
  expiresAt: Date,
): Promise<number> {
  const product = await prisma.product.findUnique({
    where: { catalogId },
    select: { id: true },
  });
  if (!product) return 0;

  await clearNightlyQuotesForProduct(product.id);

  const rows = offersToStoredRows(results, NIGHTLY_SOURCE);
  if (!rows.length) return 0;

  const now = new Date();

  await prisma.priceQuote.createMany({
    data: rows.map((o) => ({
      productId: product.id,
      retailerId: o.retailerId,
      channel: o.channel,
      storeTitle: o.storeTitle,
      imageUrl: o.imageUrl,
      priceUsd: o.priceUsd,
      wasPriceUsd: o.wasPriceUsd,
      landedCostUsd: o.landedCostUsd,
      unitPriceUsd: o.unitPriceUsd,
      inStock: o.inStock,
      matchConfidence: o.matchConfidence,
      source: o.source,
      productUrl: o.productUrl,
      affiliateUrl: o.affiliateUrl,
      fetchedAt: new Date(o.priceAsOf ?? now.toISOString()),
      expiresAt,
    })),
  });

  return rows.length;
}

function intentForCatalogItem(item: CatalogItem): ShoppingIntent {
  return {
    query: [item.brand, item.title].filter(Boolean).join(" ").trim(),
    category: item.category,
    zipCode: "78701",
  };
}

/**
 * Pre-compute one product’s compare grid and store until expiresAt (usually start of next day).
 */
export async function indexCatalogItemNightly(
  item: CatalogItem,
  expiresAt: Date,
): Promise<{ offerCount: number }> {
  const intent = intentForCatalogItem(item);
  let results = (await runSearchWithLivePricing(intent, item)).results;

  if (isAmazonPaapiConfigured()) {
    const amazonQuotes = await fetchAmazonLiveQuotes(intent, item);
    if (amazonQuotes.length > 0) {
      const merged = mergeLivePrices(
        results,
        amazonQuotes,
        item,
        intent,
        "connector_api",
      );
      results = merged.results;
    }
  }

  const offerCount = await persistNightlySearchResults(
    item.id,
    results,
    expiresAt,
  );
  return { offerCount };
}

export interface NightlyIndexReport {
  productsIndexed: number;
  offersWritten: number;
  expiredPurged: number;
  amazonPaapi: boolean;
  expiresAt: string;
}

export interface NightlyIndexOptions {
  /** e.g. "shoes" — omit to index full catalog */
  category?: string;
  /** Max products per run (rate limits) */
  limit?: number;
  /** Delay ms between products (Amazon PA-API / politeness) */
  delayMs?: number;
}

export async function runNightlyPriceIndex(
  options: NightlyIndexOptions = {},
): Promise<NightlyIndexReport> {
  const { CATALOG } = await import("../retailers/catalog");
  const { ensureCatalogSynced } = await import("../db/catalog-sync");

  const expiredPurged = await purgeExpiredPriceQuotes();
  await ensureCatalogSynced();

  const expiresAt = startOfNextLocalDay();
  let items = [...CATALOG];
  if (options.category) {
    items = items.filter((i) => i.category === options.category);
  }
  shuffleInPlace(items);

  if (options.limit && options.limit > 0) {
    items = items.slice(0, options.limit);
  }

  const delayMs = options.delayMs ?? 350;
  let productsIndexed = 0;
  let offersWritten = 0;

  for (const item of items) {
    const { offerCount } = await indexCatalogItemNightly(item, expiresAt);
    if (offerCount > 0) {
      productsIndexed += 1;
      offersWritten += offerCount;
    }
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    productsIndexed,
    offersWritten,
    expiredPurged,
    amazonPaapi: isAmazonPaapiConfigured(),
    expiresAt: expiresAt.toISOString(),
  };
}
