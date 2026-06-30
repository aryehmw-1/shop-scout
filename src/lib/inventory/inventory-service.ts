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
import {
  coversQueryExpanded,
  sharesContentWord,
  sharesProductType,
  isShortQuery,
  matchesAsHeadTerm,
  baseTokens,
} from "../search/query-understanding";

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
    // classifyOfferFreshness reads priceAsOf/lastVerifiedAt (NOT fetchedAt), and
    // without them falls back to Date.now() — making every persisted quote look
    // "fresh" regardless of real age. Stamp the real fetch time so stale offers
    // degrade and label correctly (graceful-stale visibility).
    priceAsOf: row.fetchedAt.toISOString(),
    lastVerifiedAt: row.fetchedAt.toISOString(),
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

  const fetchCandidates = (freshOnly: boolean) =>
    prisma.product.findMany({
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
            ...(freshOnly ? { expiresAt: { gt: now } } : {}),
            source: { in: ["scraped", "connector_api", "daily_index", "nightly_index"] },
          },
          orderBy: [{ fetchedAt: "desc" }, { landedCostUsd: "asc" }],
          take: 40,
        },
      },
      take: catalogIds.length,
    });

  let products = await fetchCandidates(Boolean(filters.freshOnly));
  let withQuotes = products.filter((row) => row.priceQuotes.length > 0);

  // STALE-FALLBACK RECALL: the product exists but only has stale/expired quotes.
  // Don't return null and pretend we don't know it — re-fetch the latest quote
  // regardless of freshness so it surfaces, clearly labeled stale downstream
  // (FreshnessIndicator + the "showing last known prices" banner). Honest recall
  // beats a false "couldn't find it".
  if (!withQuotes.length && filters.freshOnly) {
    products = await fetchCandidates(false);
    withQuotes = products.filter((row) => row.priceQuotes.length > 0);
    if (withQuotes.length) {
      console.log("[inventory] stale-fallback recall used", {
        query: normalized,
        candidates: withQuotes.length,
      });
    }
  }

  // Among products that actually have offers, pick the MOST RELEVANT to the query
  // (title/brand token overlap) — so "LACK coffee table" picks the IKEA LACK, not
  // a grocery lookalike that merely shares the word "coffee".
  if (!withQuotes.length) return null;

  // SHORT-QUERY HEAD-TERM GATE: for 1–2 word searches, only keep products whose
  // TYPE matches the query — "refrigerator" must be a refrigerator, not a juice
  // bottle whose title says "refrigerator-safe". If nothing qualifies, return null
  // (honest no-match) rather than surfacing an incidental-keyword lookalike.
  const candidatePool =
    isShortQuery(normalized)
      ? withQuotes.filter((row) =>
          matchesAsHeadTerm(normalized, `${row.brand} ${row.title}`, row.category),
        )
      : withQuotes;
  if (!candidatePool.length) return null;

  const tokens = normalized.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const ql = normalized.toLowerCase();
  const product = candidatePool
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
  const floorPasses = coversQueryExpanded(
    `${product.brand} ${product.title} ${product.category}`,
    normalized,
  );
  console.log("[search-db]", {
    query: normalized,
    retrievedCandidates: catalogIds.length,
    withQuotes: withQuotes.length,
    afterHeadGate: candidatePool.length,
    removedByHeadGate: withQuotes.length - candidatePool.length,
    selected: `${product.brand} ${product.title}`.slice(0, 48),
    relevanceFloorPasses: floorPasses,
  });
  if (!floorPasses) {
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
  // Singularize plurals for matching ("sponges"→"sponge") so a query and a title
  // that disagree on number still match. "sponge" is a substring of "sponges", so
  // a singular token matches both forms. Guarded to avoid butchering short words.
  const singularize = (t: string) =>
    t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/gi, ""))
    .filter((t) => t.length > 1)
    .map(singularize);
  if (!tokens.length) return [];
  const ql = singularize(query.toLowerCase().trim());

  // POPULARITY-ORDERED sampling. The old code did `take:50` over an unordered OR
  // match, so for broad terms ("dish soap" matches thousands) it sampled arbitrary
  // rows and the genuine 2-token matches were often never seen → empty results.
  // We now (1) take the full-PHRASE title matches first (highest precision), then
  // (2) a popularity-ordered token-AND pool, then (3) a token-OR pool — each
  // ordered by popularityScore so we always see the BEST candidates, not random ones.
  const order = [{ popularityScore: "desc" as const }, { searchFrequency: "desc" as const }];
  const sel = { catalogId: true, title: true, brand: true, category: true, keywordsJson: true };

  const phraseRows =
    tokens.length > 1
      ? await prisma.product.findMany({
          where: {
            published: true,
            validationStatus: "approved",
            title: { contains: ql, mode: "insensitive" },
          },
          select: sel,
          orderBy: order,
          take: 80,
        })
      : [];

  const andRows =
    tokens.length > 1
      ? await prisma.product.findMany({
          where: {
            published: true,
            validationStatus: "approved",
            AND: tokens.map((t) => ({
              OR: [
                { title: { contains: t, mode: "insensitive" as const } },
                { keywordsJson: { contains: t, mode: "insensitive" as const } },
              ],
            })),
          },
          select: sel,
          orderBy: order,
          take: 80,
        })
      : [];

  const orRows = await prisma.product.findMany({
    where: {
      published: true,
      validationStatus: "approved",
      OR: [
        ...tokens.map((t) => ({ title: { contains: t, mode: "insensitive" as const } })),
        ...tokens.map((t) => ({ brand: { contains: t, mode: "insensitive" as const } })),
        ...tokens.map((t) => ({ keywordsJson: { contains: t, mode: "insensitive" as const } })),
      ],
    },
    select: sel,
    orderBy: order,
    take: 120,
  });

  const seen = new Map<string, { catalogId: string; score: number }>();
  const consider = (rows: typeof orRows, phraseBonus: number) => {
    for (const p of rows) {
      if (seen.has(p.catalogId)) continue;
      const title = p.title.toLowerCase();
      const hay = `${p.brand} ${p.title} ${p.category} ${p.keywordsJson}`.toLowerCase();
      let score = phraseBonus;
      if (title.includes(ql)) score += 40;
      else if (hay.includes(ql)) score += 24;
      // Token hits weight TITLE higher than keywords (keyword stuffing is noisy —
      // it's what made "mop" surface a dish-soap whose keywords mention mopping).
      for (const t of tokens) {
        if (title.includes(t)) score += 14;
        else if (hay.includes(t)) score += 6;
      }
      seen.set(p.catalogId, { catalogId: p.catalogId, score });
    }
  };
  consider(phraseRows, 30);
  consider(andRows, 18);
  consider(orRows, 0);

  return [...seen.values()]
    .filter((s) => s.score >= 24) // ≥2 title-token hits or a full-phrase hit
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

/** Best available product photo: prefer the canonical product image, else the
 *  first offer that actually carries a usable (https) image. Keeps similar-product
 *  cards from rendering a blank when the cheapest quote happens to lack a photo. */
function bestProductImage(
  productImage: string | null | undefined,
  quotes: { imageUrl: string | null }[],
): string {
  const usable = (u: string | null | undefined): u is string => !!u && u.startsWith("https://");
  if (usable(productImage)) return productImage;
  for (const q of quotes) if (usable(q.imageUrl)) return q.imageUrl;
  return productImage ?? quotes.find((q) => q.imageUrl)?.imageUrl ?? "";
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
        // Take several (not just the cheapest) so we can pick the best available
        // product image across offers — the cheapest quote may lack a photo even
        // when a sibling offer for the same product has one.
        take: 6,
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
      imageUrl: bestProductImage(p.imageUrl, p.priceQuotes),
      retailer,
      retailerName: getRetailerMeta(retailer).name,
      price: q.priceUsd,
      productUrl: q.productUrl,
      affiliateUrl: affiliateSafeDestination(retailer, q.productUrl, q.affiliateUrl),
    });
    if (out.length >= (opts.limit ?? 6)) break;
  }
  // Selected by relevance (overlap), but DISPLAYED cheapest-first within the
  // similar section so the best values lead.
  out.sort((a, b) => a.price - b.price);
  return out;
}

/**
 * BROADENED fallback for when an EXACT search found nothing — so the request form
 * is a true last resort. Progressively drops trailing qualifier tokens (e.g.
 * "Ninja Air Fryer Max XL" → "Ninja Air Fryer" → "Ninja") and returns relevant
 * products as similar/closest matches, each still gated to the ORIGINAL query
 * (synonym-aware) so we never fill space with junk. Price-sorted (cheapest first).
 */
export async function findBroadenedSimilar(
  query: string,
  limit = 6,
): Promise<SimilarProduct[]> {
  const tokens = baseTokens(query);
  if (tokens.length < 1) return [];

  for (let keep = Math.min(tokens.length, 3); keep >= 1; keep--) {
    const broad = tokens.slice(0, keep).join(" ");
    const ids = await dbProductCatalogIdsForQuery(broad, 24);
    if (!ids.length) continue;

    const products = await prisma.product.findMany({
      where: { catalogId: { in: ids }, published: true, validationStatus: "approved" },
      include: {
        priceQuotes: {
          where: { source: { in: ["scraped", "connector_api", "daily_index", "nightly_index"] } },
          orderBy: [{ fetchedAt: "desc" }, { landedCostUsd: "asc" }],
          // Several quotes so bestProductImage can find a photo if the freshest lacks one.
          take: 6,
        },
      },
      take: ids.length,
    });

    const out: SimilarProduct[] = [];
    for (const p of products) {
      const q = p.priceQuotes[0];
      if (!q) continue;
      // Must share the broadened STEM's product TYPE (head noun) — so "Ninja Air
      // Fryer Max XL …" yields other air fryers, never a Ninja blender, and
      // "refrigerator" never yields a light bulb or a "cleaner for refrigerator".
      if (!sharesProductType(broad, `${p.brand} ${p.title}`, p.category)) continue;
      const retailer = q.retailerId as RetailerId;
      out.push({
        catalogId: p.catalogId,
        title: p.title,
        brand: p.brand,
        imageUrl: bestProductImage(p.imageUrl, p.priceQuotes),
        retailer,
        retailerName: getRetailerMeta(retailer).name,
        price: q.priceUsd,
        productUrl: q.productUrl,
        affiliateUrl: affiliateSafeDestination(retailer, q.productUrl, q.affiliateUrl),
      });
    }
    if (out.length) {
      out.sort((a, b) => a.price - b.price);
      return out.slice(0, limit);
    }
  }
  return [];
}

/**
 * NEVER-EMPTY fallback. When live + cached + broadened-quoted search all came up
 * empty, surface relevant products we ALREADY have in the catalog — even though
 * they have no live offer yet — using their base/typical price as a clearly-labeled
 * ESTIMATE. The catalog has ~24k products with images + base prices but only ~0.4%
 * are currently priced, so this is what makes the full catalog searchable without
 * importing anything new. Each card links INTERNALLY to the product page so a tap
 * pulls live prices. Gated by product-type so we never fill space with junk.
 */
export async function findCatalogEstimateMatches(
  query: string,
  limit = 6,
): Promise<SimilarProduct[]> {
  const queryTokens = baseTokens(query).filter((t) => t.length > 1);
  if (!queryTokens.length) return [];

  // High-recall candidate pool (phrase/AND/OR, popularity-ordered).
  const ids = await dbProductCatalogIdsForQuery(query, 60);
  if (!ids.length) return [];

  const products = await prisma.product.findMany({
    where: {
      catalogId: { in: ids },
      published: true,
      validationStatus: "approved",
      basePriceUsd: { gt: 0 },
    },
    orderBy: [{ popularityScore: "desc" }, { searchFrequency: "desc" }],
    take: ids.length,
  });

  // Balance recall and precision. A WRONG estimate (water for "aluminum foil") is
  // worse than an honest empty, but requiring EVERY token was too strict ("ARM and
  // HAMMER laundry detergent" → 0 because no title has all four words). So we
  // require: (1) the HEAD noun (last content token) present as a whole title word
  // — the product type itself — and (2) a MAJORITY of query tokens present. Whole-
  // word (plural-tolerant), never substring (which let "riptide" match "tide").
  // The sharesProductType gate is the precision backstop.
  const norm = (t: string) => t.replace(/s$/, "");
  const head = norm(queryTokens[queryTokens.length - 1]!);
  const needed = Math.max(1, Math.ceil(queryTokens.length / 2));
  const titleMatches = (title: string): boolean => {
    const titleTokens = new Set(baseTokens(title).map(norm));
    if (!titleTokens.has(head)) return false; // must be the right product type
    const hits = queryTokens.filter((q) => titleTokens.has(norm(q))).length;
    return hits >= needed;
  };

  const out: SimilarProduct[] = [];
  for (const p of products) {
    if (!titleMatches(p.title)) continue;
    if (!sharesProductType(query, `${p.brand} ${p.title}`, p.category)) continue;
    const image = bestProductImage(p.imageUrl, []);
    if (!image.startsWith("https://")) continue; // only show cards with a real photo
    out.push({
      catalogId: p.catalogId,
      title: p.title,
      brand: p.brand,
      imageUrl: image,
      retailer: "amazon" as RetailerId, // neutral; estimate has no live retailer yet
      retailerName: "Catalog",
      price: p.basePriceUsd,
      productUrl: "",
      affiliateUrl: null,
      priceApproximate: true,
      internalUrl: `/inventory/products/${p.catalogId}`,
    });
    if (out.length >= limit * 3) break;
  }
  out.sort((a, b) => a.price - b.price);
  if (out.length) {
    console.log("[search-estimate-fallback]", { query, surfaced: Math.min(out.length, limit) });
  }
  return out.slice(0, limit);
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
