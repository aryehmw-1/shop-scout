import { prisma } from "../../db/prisma";
import { getRetailerMeta } from "../../retailers/meta";
import type { CatalogItem } from "../../retailers/catalog";
import type { RetailerId } from "../../types";
import { storedRowToLiveQuoteFields } from "../../indexing/offer-rows";
import type { LiveQuote } from "./live-quote";

const MEMORY_CACHE = new Map<
  string,
  { quotes: LiveQuote[]; expiresAt: number }
>();
const MEMORY_TTL_MS = 5 * 60 * 1000;

/**
 * Free live pricing: reuse non-expired connector_api / cached_quote rows from SQLite.
 * Populated when SerpAPI (or future connectors) has run before for this product.
 */
export async function fetchCachedLiveQuotes(
  catalogId: string,
): Promise<LiveQuote[]> {
  const memKey = catalogId;
  const mem = MEMORY_CACHE.get(memKey);
  if (mem && Date.now() < mem.expiresAt) {
    return mem.quotes;
  }

  const product = await prisma.product.findUnique({
    where: { catalogId },
    select: { id: true },
  });
  if (!product) {
    MEMORY_CACHE.set(memKey, { quotes: [], expiresAt: Date.now() + MEMORY_TTL_MS });
    return [];
  }

  const now = new Date();
  const rows = await prisma.priceQuote.findMany({
    where: {
      productId: product.id,
      expiresAt: { gt: now },
      source: {
        in: ["scraped", "connector_api", "daily_index", "nightly_index"],
      },
    },
    orderBy: { fetchedAt: "desc" },
    take: 120,
  });

  const byRetailer = new Map<RetailerId, LiveQuote>();

  for (const row of rows) {
    const retailerId = row.retailerId as RetailerId;
    if (byRetailer.has(retailerId)) continue;
    if (!row.productUrl.startsWith("http")) continue;

    const meta = getRetailerMeta(retailerId);
    const fields = storedRowToLiveQuoteFields({
      retailerId,
      storeTitle: row.storeTitle,
      imageUrl: row.imageUrl,
      priceUsd: row.priceUsd,
      productUrl: row.productUrl,
      source: row.source,
      sourceLabel: meta.name,
    });

    if (process.env.PIPELINE_DEBUG === "1") {
      console.log("[cached-quotes]", catalogId, retailerId, {
        dbSource: row.source,
        priceUsd: row.priceUsd,
        imageUrl: row.imageUrl?.slice(0, 80),
        priceSource: fields.priceSource,
      });
    }

    byRetailer.set(retailerId, fields);
  }

  const quotes = [...byRetailer.values()];
  MEMORY_CACHE.set(memKey, {
    quotes,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });
  return quotes;
}

export async function fetchCachedLiveQuotesForItem(
  item: CatalogItem,
): Promise<LiveQuote[]> {
  return fetchCachedLiveQuotes(item.id);
}
