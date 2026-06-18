/**
 * Deterministic verified inventory resolver — high-recall fuzzy matching for flagship grocery.
 */

import { prisma } from "../db/prisma";
import { CATALOG, type CatalogItem } from "../retailers/catalog";
import { getFlagshipCatalogIds, isFlagshipCatalogId } from "./flagship-catalog";
import { normalizeSearchQuery, suggestCatalogProducts } from "../search/query-normalize";
import { isShortQuery, matchesAsHeadTerm } from "../search/query-understanding";
import type { ResolvedProduct } from "../search/types";
import type { RetailerId } from "../types";
import { storedRowToLiveQuoteFields } from "../indexing/offer-rows";
import { getRetailerMeta } from "../retailers/meta";
import type { LiveQuote } from "../search/providers/live-quote";
import { consumerVisibleQuoteWhere } from "../pricing/quote-freshness-policy";

const VERIFIED_SOURCES = ["scraped", "connector_api", "daily_index", "nightly_index"];

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "for", "with", "find", "me", "get", "buy",
  "organic", "fresh", "best", "cheap", "compare",
]);

/** Query aliases → catalogId (high-recall grocery matching). */
export const GROCERY_CATALOG_ALIASES: Record<string, string[]> = {
  "milk-whole-gal": [
    "whole milk",
    "milk gallon",
    "gallon milk",
    "vitamin d milk",
    "great value whole milk",
    "great value milk",
  ],
  "cereal-honey": [
    "honey nut cereal",
    "honey nut cheerios",
    "cheerios honey nut",
    "honey nut",
    "cheerios cereal",
  ],
  "yogurt-greek": ["greek yogurt", "plain greek yogurt", "chobani yogurt"],
  "coffee-ground": ["ground coffee", "coffee beans ground", "folgers coffee"],
  "paper-towels": ["paper towels", "bounty paper towels", "paper towel"],
  "pasta-spaghetti": ["spaghetti", "pasta spaghetti", "barilla spaghetti"],
  "eggs-dozen": ["large eggs", "dozen eggs", "organic eggs"],
  "spinach-og-10": ["organic spinach", "baby spinach", "spinach"],
  "potato-chips": [
    "potato chips",
    "lays chips",
    "lay's chips",
    "lays classic",
    "lay's classic",
    "classic potato chips",
    "lays classic potato chips",
    "chips",
  ],
  "cheese-crackers": [
    "cheez-it",
    "cheez it",
    "cheezit",
    "cheez-it original",
    "cheez it original",
    "cheez-it original cheese crackers",
    "cheez it original cheese crackers",
    "original cheese crackers",
    "cheese crackers",
  ],
  "bread-wheat": ["whole wheat bread", "wheat bread", "bread"],
  "chicken-breast": ["chicken breast", "boneless chicken breast"],
  "ground-beef": ["ground beef", "lean ground beef"],
  "oj-juice": ["orange juice", "oj", "tropicana orange juice"],
  "granola-bars": ["nature valley", "granola bars", "nature valley granola"],
  "peanut-butter": ["peanut butter", "jif peanut butter", "skippy peanut butter"],
  "mac-cheese": ["mac and cheese", "kraft mac and cheese", "macaroni and cheese"],
  "cola-classic-12": ["coca cola", "coke 12 pack", "coca-cola"],
  "pepsi-12pk": ["pepsi", "pepsi 12 pack"],
  "toilet-paper-12": ["charmin toilet paper", "toilet paper"],
  "frozen-pizza": ["digiorno pizza", "frozen pizza"],
};

export type VerifiedMatchMethod =
  | "alias_exact"
  | "alias_fuzzy"
  | "catalog_fuzzy"
  | "keyword_suggest"
  | "title_token"
  | "asin"
  | "catalog_id"
  | "none";

export interface VerifiedInventoryCandidate {
  catalogId: string;
  title: string;
  brand: string;
  score: number;
  method: VerifiedMatchMethod;
  hasPersistedQuotes: boolean;
  rejectedReason?: string;
}

export interface VerifiedInventoryResolution {
  hit: boolean;
  catalogItem?: CatalogItem;
  resolved?: ResolvedProduct;
  matchMethod: VerifiedMatchMethod;
  matchScore: number;
  candidates: VerifiedInventoryCandidate[];
  quotes: LiveQuote[];
  lastVerifiedAt?: string;
  qaStatus?: "approved" | "pending" | "rejected" | "none";
  normalizationNote?: string;
}

function groceryTokens(query: string): string[] {
  return normalizeSearchQuery(query)
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function aliasMatch(query: string): { catalogId: string; method: VerifiedMatchMethod; score: number } | null {
  const q = normalizeSearchQuery(query).toLowerCase();
  if (!q) return null;

  for (const [catalogId, aliases] of Object.entries(GROCERY_CATALOG_ALIASES)) {
    for (const alias of aliases) {
      const a = alias.toLowerCase();
      if (q === a) return { catalogId, method: "alias_exact", score: 100 };
      if (q.includes(a) || a.includes(q)) {
        return { catalogId, method: "alias_fuzzy", score: 85 + Math.min(a.length, q.length) };
      }
    }
  }
  return null;
}

function scoreCatalogItem(item: CatalogItem, tokens: string[], query: string): number {
  const hay = `${item.brand} ${item.title} ${item.keywords.join(" ")} ${item.category}`.toLowerCase();
  let score = 0;
  let textHit = false;

  if (hay.includes(query)) {
    score += 40;
    textHit = true;
  }
  for (const t of tokens) {
    if (hay.includes(t)) {
      score += 12;
      textHit = true;
    }
  }

  // The catalog's own fuzzy suggester ranking this item #1 is a real (synonym)
  // signal even without a raw substring hit.
  const suggest = suggestCatalogProducts(query, 3);
  const isSuggested = suggest[0]?.catalogId === item.id;

  // The flagship/suggest bonuses must NOT qualify an item on their own. Without a
  // real textual (or suggester) basis, "office chair" would score +15 against a
  // flagship "Spring Mix Salad" and — if it has a persisted quote — get accepted
  // as a verified hit. Require an actual match before any bonus applies.
  if (!textHit && !isSuggested) return 0;

  if (isFlagshipCatalogId(item.id)) score += 15;
  if (isSuggested) score += 20;

  return score;
}

export function rankVerifiedInventoryCandidates(query: string): VerifiedInventoryCandidate[] {
  const q = normalizeSearchQuery(query);
  if (!q) return [];

  const tokens = groceryTokens(q);
  const flagshipIds = new Set(getFlagshipCatalogIds());
  const candidates: VerifiedInventoryCandidate[] = [];
  const seen = new Set<string>();

  const alias = aliasMatch(q);
  if (alias) {
    const item = CATALOG.find((c) => c.id === alias.catalogId);
    if (item) {
      candidates.push({
        catalogId: item.id,
        title: item.title,
        brand: item.brand,
        score: alias.score,
        method: alias.method,
        hasPersistedQuotes: false,
      });
      seen.add(item.id);
    }
  }

  for (const item of CATALOG) {
    if (
      !flagshipIds.has(item.id) &&
      item.category !== "pantry" &&
      item.category !== "dairy" &&
      item.category !== "household"
    ) {
      continue;
    }
    const score = scoreCatalogItem(item, tokens, q);
    if (score < 12) continue;
    if (seen.has(item.id)) {
      const existing = candidates.find((c) => c.catalogId === item.id);
      if (existing) existing.score = Math.max(existing.score, score);
      continue;
    }
    candidates.push({
      catalogId: item.id,
      title: item.title,
      brand: item.brand,
      score,
      method: score >= 40 ? "title_token" : "catalog_fuzzy",
      hasPersistedQuotes: false,
    });
    seen.add(item.id);
  }

  const suggestions = suggestCatalogProducts(q, 5);
  for (const s of suggestions) {
    const item = CATALOG.find((c) => c.id === s.catalogId);
    if (!item) continue;
    const existing = candidates.find((c) => c.catalogId === item.id);
    if (existing) {
      existing.score = Math.max(existing.score, s.score + 10);
      if (existing.method === "catalog_fuzzy") existing.method = "keyword_suggest";
    } else {
      candidates.push({
        catalogId: item.id,
        title: item.title,
        brand: item.brand,
        score: s.score + 10,
        method: "keyword_suggest",
        hasPersistedQuotes: false,
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 8);
}

export async function loadPersistedLiveQuotes(catalogId: string): Promise<LiveQuote[]> {
  const product = await prisma.product.findUnique({
    where: { catalogId },
    include: {
      priceQuotes: {
        where: {
          source: { in: VERIFIED_SOURCES },
          ...consumerVisibleQuoteWhere(),
        },
        include: { qaReview: true },
        orderBy: { fetchedAt: "desc" },
      },
    },
  });

  // Publishability gate: a product that is unpublished or not approved
  // (rejected / needs_review / raw / unverified) surfaces NO public offers.
  if (
    !product ||
    product.published === false ||
    product.validationStatus !== "approved"
  ) {
    return [];
  }
  if (!product.priceQuotes.length) return [];

  const quotes: LiveQuote[] = [];
  const seenStandardRetailers = new Set<RetailerId>();

  for (const row of product.priceQuotes) {
    const retailerId = row.retailerId as RetailerId;
    if (!row.productUrl.startsWith("http")) continue;
    const isProviderMarketplace = row.providerSource === "ebay" || row.providerSource === "shopsavvy";
    if (!isProviderMarketplace) {
      if (seenStandardRetailers.has(retailerId)) continue;
      seenStandardRetailers.add(retailerId);
    }

    const meta = getRetailerMeta(retailerId);
    const fields = storedRowToLiveQuoteFields({
      retailerId,
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
    });

    quotes.push({
      ...fields,
      matchConfidence: row.matchConfidence ?? 0.86,
      identityConfidence: row.identityConfidence ?? row.matchConfidence ?? 0.86,
      imageConfidence: row.imageConfidence ?? 0.75,
      confidenceReasons: [
        {
          code: "persisted_inventory.hit",
          message: "Matched verified persisted inventory",
          weight: 1,
        },
        {
          code: "identifier.exact",
          message: "Indexed catalog product with active verified quote",
          weight: 0.9,
        },
      ],
      fetchedAt: row.fetchedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      verifiedPersistedInventory: true,
      qaStatus: (row.qaReview?.status as "approved" | "pending" | "rejected") ?? "none",
      normalizationNote: "verified_persisted_quote",
      dbSource: row.source,
    });
  }

  return quotes;
}

export async function resolveVerifiedInventoryQuery(
  query: string,
): Promise<VerifiedInventoryResolution> {
  const candidates = rankVerifiedInventoryCandidates(query);

  for (const candidate of candidates) {
    const quotes = await loadPersistedLiveQuotes(candidate.catalogId);
    candidate.hasPersistedQuotes = quotes.length > 0;

    const item = CATALOG.find((c) => c.id === candidate.catalogId);
    if (!item) {
      candidate.rejectedReason = "catalog_item_missing";
      continue;
    }

    if (quotes.length === 0) {
      candidate.rejectedReason = "no_active_persisted_quotes";
      const groceryCategory =
        item.category === "dairy" ||
        item.category === "pantry" ||
        item.category === "household" ||
        item.category === "produce";
      if (
        candidate.score >= 35 &&
        groceryCategory &&
        candidates[0]?.catalogId === candidate.catalogId
      ) {
        return {
          hit: false,
          catalogItem: item,
          resolved: {
            catalogId: item.id,
            title: item.title,
            brand: item.brand,
            confidence: Math.min(0.82, 0.5 + candidate.score / 120),
            matchReason: `verified_inventory_${candidate.method}_catalog_only`,
            synthetic: false,
          },
          matchMethod: candidate.method,
          matchScore: candidate.score,
          candidates,
          quotes: [],
          normalizationNote: "catalog_match_no_persisted_quotes",
        };
      }
      continue;
    }

    const bestQuote = quotes[0]!;
    const confidence = Math.min(0.98, 0.6 + candidate.score / 200);

    return {
      hit: true,
      catalogItem: item,
      resolved: {
        catalogId: item.id,
        title: item.title,
        brand: item.brand,
        confidence,
        matchReason: `verified_inventory_${candidate.method}`,
        synthetic: false,
      },
      matchMethod: candidate.method,
      matchScore: candidate.score,
      candidates,
      quotes,
      lastVerifiedAt: bestQuote.fetchedAt,
      qaStatus: bestQuote.qaStatus ?? "none",
      normalizationNote: bestQuote.normalizationNote,
    };
  }

  // Static catalog missed. Fall back to DB-backed product search so products
  // imported via the ingestion pipeline (e.g. IKEA) are discoverable by chat —
  // still reading ONLY published/approved rows from Postgres (no scraping/AI).
  const dbHit = await resolveFromDbProducts(query, candidates);
  if (dbHit) return dbHit;

  return {
    hit: false,
    matchMethod: "none",
    matchScore: 0,
    candidates,
    quotes: [],
  };
}

/** Turn a DB Product row into the flat CatalogItem shape the chat path expects. */
function productToCatalogItem(p: {
  catalogId: string;
  title: string;
  brand: string;
  sizeLabel: string;
  upc: string | null;
  imageUrl: string | null;
  category: string;
  keywordsJson: string;
  organic: boolean;
  basePriceUsd: number;
  unitLabel: string;
  slug: string;
}): CatalogItem {
  let keywords: string[] = [];
  try {
    keywords = JSON.parse(p.keywordsJson) as string[];
  } catch {
    /* ignore */
  }
  return {
    id: p.catalogId,
    title: p.title,
    brand: p.brand,
    size: p.sizeLabel,
    upc: p.upc ?? "",
    imageUrl: p.imageUrl ?? "",
    category: p.category,
    keywords,
    organic: p.organic,
    basePrice: p.basePriceUsd,
    unitLabel: p.unitLabel,
    slug: p.slug,
  };
}

/**
 * Postgres-backed product search over PUBLISHED + APPROVED catalog rows. Used as
 * a fallback when the static in-memory catalog has no match, so DB-only products
 * (Bright Data imports) are discoverable. No scraping, AI, or Bright Data calls.
 */
async function resolveFromDbProducts(
  query: string,
  existingCandidates: VerifiedInventoryCandidate[],
): Promise<VerifiedInventoryResolution | null> {
  const tokens = groceryTokens(query);
  if (!tokens.length) return null;

  const products = await prisma.product.findMany({
    where: {
      published: true,
      validationStatus: "approved",
      OR: [
        ...tokens.map((t) => ({ title: { contains: t, mode: "insensitive" as const } })),
        ...tokens.map((t) => ({ brand: { contains: t, mode: "insensitive" as const } })),
        ...tokens.map((t) => ({ keywordsJson: { contains: t, mode: "insensitive" as const } })),
      ],
    },
    take: 30,
    select: {
      catalogId: true, title: true, brand: true, sizeLabel: true, upc: true,
      imageUrl: true, category: true, keywordsJson: true, organic: true,
      basePriceUsd: true, unitLabel: true, slug: true,
    },
  });
  if (!products.length) return null;

  const ql = query.toLowerCase();
  // HEAD-NOUN gate for short/broad queries: the bulk-imported rows carry long,
  // keyword-stuffed titles, so a plain substring match surfaces incidental
  // mentions — "refrigerator" hits a juice bottle ("...for Juicing, Refrigerator,
  // BPA Free"), "monitor" hits a battery tester ("...Electrical Monitor Meter"),
  // "vacuum" hits a "Vacuum Insulated" water bottle. Require the query word in the
  // product's HEAD REGION (or category), so the row's actual TYPE is the match.
  const gateHead = isShortQuery(query);
  const scored = products
    .filter((p) => !gateHead || matchesAsHeadTerm(query, `${p.brand} ${p.title}`, p.category ?? undefined))
    .map((p) => {
      const hay = `${p.brand} ${p.title} ${p.category} ${p.keywordsJson}`.toLowerCase();
      let score = hay.includes(ql) ? 40 : 0;
      for (const t of tokens) if (hay.includes(t)) score += 12;
      return { p, score };
    })
    .filter((s) => s.score >= 24) // require ≥2 token hits or a phrase hit
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;

  const dbCandidates: VerifiedInventoryCandidate[] = scored.map((s) => ({
    catalogId: s.p.catalogId,
    title: s.p.title,
    brand: s.p.brand,
    score: s.score,
    method: "title_token",
    hasPersistedQuotes: false,
  }));

  for (const { p, score } of scored.slice(0, 8)) {
    const quotes = await loadPersistedLiveQuotes(p.catalogId);
    if (!quotes.length) continue;
    return {
      hit: true,
      catalogItem: productToCatalogItem(p),
      resolved: {
        catalogId: p.catalogId,
        title: p.title,
        brand: p.brand,
        confidence: Math.min(0.95, 0.6 + score / 200),
        matchReason: "db_product_title_token",
        synthetic: false,
      },
      matchMethod: "title_token",
      matchScore: score,
      candidates: [...existingCandidates, ...dbCandidates],
      quotes,
      lastVerifiedAt: quotes[0]!.fetchedAt,
    };
  }
  return null;
}

export async function resolveVerifiedInventoryByAsin(
  asin: string,
): Promise<VerifiedInventoryResolution> {
  const upper = asin.toUpperCase();

  const quote = await prisma.priceQuote.findFirst({
    where: {
      productUrl: { contains: upper },
      source: { in: VERIFIED_SOURCES },
      ...consumerVisibleQuoteWhere("amazon"),
      retailerId: "amazon",
    },
    include: { product: true, qaReview: true },
    orderBy: { fetchedAt: "desc" },
  });

  let catalogId = quote?.product.catalogId;

  if (!catalogId) {
    const identity = await prisma.productIdentifier.findFirst({
      where: { type: "asin", value: upper },
      include: { product: true },
    });
    catalogId = identity?.product?.catalogId;
  }

  if (!catalogId) {
    return {
      hit: false,
      matchMethod: "none",
      matchScore: 0,
      candidates: [],
      quotes: [],
    };
  }

  const item = CATALOG.find((c) => c.id === catalogId);
  const quotes = await loadPersistedLiveQuotes(catalogId);

  if (!item || quotes.length === 0) {
    return {
      hit: false,
      matchMethod: "asin",
      matchScore: 0,
      candidates: [{
        catalogId,
        title: catalogId,
        brand: "",
        score: 0,
        method: "asin",
        hasPersistedQuotes: false,
        rejectedReason: "no_quotes",
      }],
      quotes: [],
    };
  }

  return {
    hit: true,
    catalogItem: item,
    resolved: {
      catalogId: item.id,
      title: item.title,
      brand: item.brand,
      confidence: 0.95,
      matchReason: "verified_inventory_asin",
      synthetic: false,
    },
    matchMethod: "asin",
    matchScore: 100,
    candidates: [{
      catalogId: item.id,
      title: item.title,
      brand: item.brand,
      score: 100,
      method: "asin",
      hasPersistedQuotes: true,
    }],
    quotes,
    lastVerifiedAt: quotes[0]?.fetchedAt,
    qaStatus: quotes[0]?.qaStatus ?? "none",
    normalizationNote: "verified_persisted_quote_asin",
  };
}
