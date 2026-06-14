import "server-only";

import type { PriceConnector } from "../types";
import type { ProductSearchResults, ShoppingIntent } from "../../types";
import { prisma } from "../../db/prisma";
import { rankVerifiedInventoryCandidates } from "../../inventory/verified-inventory-resolver";
import { expandQueryTokens, coversQuery } from "../query-understanding";
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

// Quote sources we treat as live/consumer-visible inventory.
const LIVE_QUOTE_SOURCES = [
  "scraped",
  "connector_api",
  "daily_index",
  "nightly_index",
  "amazon_paapi",
];

/** Match tokens for text retrieval — singular/plural + synonym aware so "lamps"
 *  finds "lamp", "tvs" finds "television", "couches" finds "sofa". */
function searchTokens(query: string): string[] {
  return expandQueryTokens(query);
}

/** Relevance score for a product against the query: whole-phrase + per-token
 *  hits across brand/title/keywords, plus a bonus for in-code-catalog ranking. */
function scoreProduct(
  product: ProductWithQuotes,
  tokens: string[],
  phraseLc: string,
  category: string | undefined,
  rankIndex: number,
): number {
  const hay = `${product.brand} ${product.title} ${product.keywordsJson}`.toLowerCase();
  let score = 0;
  if (phraseLc && hay.includes(phraseLc)) score += 40;
  for (const t of tokens) if (hay.includes(t)) score += 12;
  if (category && product.category === category) score += 8;
  if (rankIndex >= 0) score += Math.max(30 - rankIndex * 2, 4); // ranked-catalog boost
  return score;
}

async function queryDb(intent: ShoppingIntent): Promise<ProductSearchResults | null> {
  const normalized = intent.query.trim();
  if (normalized.length < 2) return null;

  const now = new Date();
  const phraseLc = normalized.toLowerCase();
  const tokens = searchTokens(normalized);

  // 1) In-code CATALOG ranker (flagship grocery/household aliases, etc.).
  const ranked = rankVerifiedInventoryCandidates(normalized).slice(0, 5);
  const rankedCatalogIds = ranked.map((c) => c.catalogId);

  // 2) DB text search — covers imported/published catalog products (Amazon,
  //    Walmart, Target, …) that are NOT in the in-code CATALOG, so they're
  //    retrievable by name/brand instead of falling through to a blind "first
  //    product with a quote" pick. Either path must carry a live offer.
  const liveQuoteFilter = {
    expiresAt: { gt: now },
    source: { in: LIVE_QUOTE_SOURCES },
  };
  const orMatch: Record<string, unknown>[] = [];
  if (rankedCatalogIds.length) orMatch.push({ catalogId: { in: rankedCatalogIds } });
  for (const t of tokens) {
    orMatch.push({ title: { contains: t, mode: "insensitive" } });
    orMatch.push({ brand: { contains: t, mode: "insensitive" } });
  }
  if (!orMatch.length) return null;

  const products = await prisma.product.findMany({
    where: {
      OR: orMatch,
      // Only return products that actually carry a live offer.
      priceQuotes: { some: liveQuoteFilter },
    },
    include: {
      priceQuotes: {
        where: liveQuoteFilter,
        orderBy: [{ fetchedAt: "desc" }, { landedCostUsd: "asc" }],
        take: 40,
      },
    },
    take: 25,
  });
  if (!products.length) return null;

  // Relevance gate: the match must cover a real share of the query's CONTENT
  // words (brand/product nouns — not units, numbers, or scent words). This stops
  // coincidental matches like "spring water" → "...Spring Water SCENT hand soap".
  // Rank by relevance. EVERY candidate must cover the query's content words
  // (whole-word, units/numbers ignored) so a single coincidental word ("spring"
  // → "Spring Mix Salad", "spring water scent soap") can't win. Shared with the
  // search-service live-relevance guard via coversQuery().
  const productText = (p: ProductWithQuotes) =>
    `${p.brand} ${p.title} ${JSON.parse(p.keywordsJson || "[]").join(" ")}`;
  const best = products
    .filter((p) => p.priceQuotes.length > 0)
    .filter((p) => coversQuery(productText(p), normalized))
    .map((p) => ({
      product: p,
      score: scoreProduct(p, tokens, phraseLc, intent.category, rankedCatalogIds.indexOf(p.catalogId)),
    }))
    .sort((a, b) => b.score - a.score)[0];

  // A pure-fallback match (no phrase/token/rank signal) is noise — skip it.
  if (!best || best.score <= 0) return null;

  return productToResults(best.product, intent);
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
