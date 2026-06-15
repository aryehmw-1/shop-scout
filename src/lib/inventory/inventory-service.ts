import "server-only";

import type { Product, PriceQuote } from "@prisma/client";
import { prisma } from "../db/prisma";
import { CATALOG, type CatalogItem } from "../retailers/catalog";
import { getRetailerMeta } from "../retailers/meta";
import type { ProductOffer, ProductSearchResults, RetailerId, ShoppingIntent, SimilarProduct } from "../types";
import { affiliateSafeDestination } from "../affiliate/outbound";
import { storedRowToLiveQuoteFields } from "../indexing/offer-rows";
import { mergeLivePrices } from "../search/merge-live-prices";
import { compareViaCatalog } from "../search/connectors/catalog-connector";
import { finalizeSearchPrices } from "../search/price-truth";
import { finalizeResultsForUser } from "../pricing/deal-intelligence";
import { rankVerifiedInventoryCandidates } from "./verified-inventory-resolver";
import { coversQueryExpanded, sharesContentWord } from "../search/query-understanding";

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
  // Not in the static catalog → synthesize from the DB Product. Callers only pass
  // PUBLISHED + APPROVED products here, so DB-only products (e.g. IKEA, ingested
  // via Bright Data) are first-class and discoverable, not gated behind the demo
  // fallback flag.
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
  const limit = filters.limit ?? 5;
  const candidates = rankVerifiedInventoryCandidates(normalized).slice(0, limit);
  const staticIds = candidates.map((candidate) => candidate.catalogId);

  // ALWAYS also search the DB by tokens so products imported via the ingestion
  // pipeline (e.g. IKEA) are discoverable even when the static catalog returns
  // weak lookalikes for common words ("table", "cabinet"). Reads only published +
  // approved rows from Postgres (no scraping/AI/Bright Data).
  const dbIds = await dbProductCatalogIdsForQuery(normalized, limit);
  const catalogIds = [...new Set([...staticIds, ...dbIds])];
  // No match at all: return null (never query the whole table).
  if (catalogIds.length === 0) return null;

  const products = await prisma.product.findMany({
    where: {
      catalogId: { in: catalogIds },
      published: true,
      validationStatus: "approved",
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
    take: catalogIds.length,
  });

  // Among products that actually have offers, pick the MOST RELEVANT to the query
  // (title/brand token overlap) — so "LACK coffee table" picks the IKEA LACK, not
  // a grocery lookalike that merely shares the word "coffee".
  const withQuotes = products.filter((row) => row.priceQuotes.length > 0);
  if (!withQuotes.length) return null;
  const tokens = normalized.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const ql = normalized.toLowerCase();
  const product = withQuotes
    .map((row) => {
      const hay = `${row.brand} ${row.title} ${row.category}`.toLowerCase();
      let score = hay.includes(ql) ? 40 : 0;
      for (const t of tokens) if (hay.includes(t)) score += 12;
      return { row, score };
    })
    .sort((a, b) => b.score - a.score)[0]!.row;

  // Relevance FLOOR: the best candidate must genuinely COVER the query's content
  // words (whole-word). Without this, a weak lookalike that merely shares a common
  // word (a snack that comes in a "bag" for "car trash bag") becomes the matched
  // product — and then its same-category "similar" items are unrelated junk
  // (→ cheese crackers). If nothing covers the query, there is NO match: return
  // null so chat shows the honest "couldn't find it" state with NO similar items.
  if (!coversQueryExpanded(`${product.brand} ${product.title} ${product.category}`, normalized)) {
    return null;
  }

  const results = await productToResults(product, { query: normalized });

  // Fill toward 7 cards with clearly-labelled SIMILAR alternatives when there
  // aren't enough exact-match offers (e.g. single-seller IKEA products).
  if (results && results.online.length < 5) {
    results.similar = await findSimilarProducts({
      category: product.category,
      excludeCatalogId: product.catalogId,
      matchedTitle: product.title,
      query: normalized,
      limit: 7 - results.online.length,
    });
  }
  return results;
}

/**
 * Postgres token search over PUBLISHED + APPROVED products → relevance-ordered
 * catalogIds. Used when the static in-memory catalog has no match, so DB-only
 * products (Bright Data imports like IKEA) are discoverable by chat search.
 */
async function dbProductCatalogIdsForQuery(query: string, limit: number): Promise<string[]> {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/gi, ""))
    .filter((t) => t.length > 1);
  if (!tokens.length) return [];

  const rows = await prisma.product.findMany({
    where: {
      published: true,
      validationStatus: "approved",
      OR: [
        ...tokens.map((t) => ({ title: { contains: t, mode: "insensitive" as const } })),
        ...tokens.map((t) => ({ brand: { contains: t, mode: "insensitive" as const } })),
        ...tokens.map((t) => ({ keywordsJson: { contains: t, mode: "insensitive" as const } })),
      ],
    },
    select: { catalogId: true, title: true, brand: true, category: true, keywordsJson: true },
    take: 50,
  });

  const ql = query.toLowerCase();
  return rows
    .map((p) => {
      const hay = `${p.brand} ${p.title} ${p.category} ${p.keywordsJson}`.toLowerCase();
      let score = hay.includes(ql) ? 40 : 0;
      for (const t of tokens) if (hay.includes(t)) score += 12;
      return { catalogId: p.catalogId, score };
    })
    .filter((s) => s.score >= 24) // ≥2 token hits or a full-phrase hit
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.catalogId);
}

/**
 * Find SIMILAR alternative products (different items) in the same category for
 * the results grid. Published + approved only; excludes the matched product.
 * Returns one lightweight card per product (cheapest fresh offer). Never used for
 * price comparison — these are labelled alternatives.
 */
const SIMILAR_STOP = new Set([
  "the", "and", "with", "for", "set", "of", "in", "x", "cm", "oz", "inch", "inches",
  "white", "black", "brown", "gray", "grey", "anthracite", "oak", "veneer",
]);

function similarTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !SIMILAR_STOP.has(t)),
  );
}

export async function findSimilarProducts(
  opts: {
    category: string;
    excludeCatalogId: string;
    matchedTitle: string;
    /** The user's original query — the gate similar items must stay relevant to. */
    query?: string;
    limit?: number;
  },
): Promise<SimilarProduct[]> {
  const now = new Date();
  const products = await prisma.product.findMany({
    where: {
      category: opts.category,
      published: true,
      validationStatus: "approved",
      catalogId: { not: opts.excludeCatalogId },
    },
    include: {
      priceQuotes: {
        where: {
          expiresAt: { gt: now },
          source: { in: ["scraped", "connector_api", "daily_index", "nightly_index"] },
        },
        orderBy: { landedCostUsd: "asc" },
        take: 1,
      },
    },
    orderBy: [{ popularityScore: "desc" }, { searchFrequency: "desc" }],
    take: 60,
  });

  // STRONG relevance gate: a "similar" item must share the same category AND at
  // least one meaningful CONTENT word with the user's QUERY (whole-word, synonym
  // aware) — not merely with the matched product, which can itself be a weak match.
  // This is what stops "car trash bag" → cheese crackers or "refrigerator" →
  // coffee. We fall back to the matched title only when no query was supplied.
  // Items that fail the gate are dropped entirely; if none pass, we return []
  // and the UI shows "no relevant alternatives" rather than random products.
  const relevantTo = opts.query?.trim() || opts.matchedTitle;
  const matchWords = similarTokens(`${opts.matchedTitle}`);
  const scored: { p: (typeof products)[number]; overlap: number }[] = [];
  for (const p of products) {
    if (!p.priceQuotes[0]) continue;
    if (!sharesContentWord(relevantTo, p.title)) continue;
    const words = similarTokens(p.title);
    let overlap = 0;
    for (const w of words) if (matchWords.has(w)) overlap += 1;
    scored.push({ p, overlap });
  }
  scored.sort((a, b) => b.overlap - a.overlap);

  const out: SimilarProduct[] = [];
  for (const { p } of scored) {
    const q = p.priceQuotes[0]!;
    const retailer = q.retailerId as RetailerId;
    out.push({
      catalogId: p.catalogId,
      title: p.title,
      brand: p.brand,
      imageUrl: p.imageUrl ?? q.imageUrl ?? "",
      retailer,
      retailerName: getRetailerMeta(retailer).name,
      price: q.priceUsd,
      productUrl: q.productUrl,
      affiliateUrl: affiliateSafeDestination(retailer, q.productUrl, q.affiliateUrl),
    });
    if (out.length >= (opts.limit ?? 6)) break;
  }
  return out;
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
