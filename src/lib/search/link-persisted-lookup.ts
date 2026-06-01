/**
 * Prefer persisted verified quotes for pasted Amazon links before live scrape.
 */

import { prisma } from "../db/prisma";
import { CATALOG } from "../retailers/catalog";
import { storedRowToLiveQuoteFields } from "../indexing/offer-rows";
import { getRetailerMeta } from "../retailers/meta";
import { extractAmazonAsin } from "../offers/amazon-validation";
import { consumerVisibleQuoteWhere } from "../pricing/quote-freshness-policy";
import type { CatalogItem } from "../retailers/catalog";
import type { RetailerId } from "../types";

const VERIFIED_SOURCES = ["scraped", "connector_api", "daily_index", "nightly_index"];

export interface PersistedLinkLookup {
  hit: boolean;
  catalogId?: string;
  catalogItem?: CatalogItem;
  priceUsd?: number;
  storeTitle?: string;
  imageUrl?: string;
  productUrl: string;
  source: string;
  matchConfidence?: number;
  fetchedAt?: string;
  lookupMethod: "asin_url" | "catalog_id" | "none";
  normalizationNote?: string;
}

export async function lookupPersistedQuoteByAsin(
  asin: string,
  sourceUrl: string,
): Promise<PersistedLinkLookup> {
  const upper = asin.toUpperCase();

  const byUrl = await prisma.priceQuote.findFirst({
    where: {
      productUrl: { contains: upper },
      source: { in: VERIFIED_SOURCES },
      ...consumerVisibleQuoteWhere("amazon"),
      retailerId: "amazon",
    },
    include: { product: true },
    orderBy: { fetchedAt: "desc" },
  });

  if (byUrl) {
    const catalog = CATALOG.find((c) => c.id === byUrl.product.catalogId);
    return {
      hit: true,
      catalogId: byUrl.product.catalogId,
      catalogItem: catalog,
      priceUsd: byUrl.priceUsd,
      storeTitle: byUrl.storeTitle ?? undefined,
      imageUrl: byUrl.imageUrl ?? undefined,
      productUrl: byUrl.productUrl,
      source: byUrl.source,
      matchConfidence: byUrl.matchConfidence,
      fetchedAt: byUrl.fetchedAt.toISOString(),
      lookupMethod: "asin_url",
      normalizationNote: "verified_persisted_quote",
    };
  }

  const identity = await prisma.productIdentifier.findFirst({
    where: { type: "asin", value: upper },
    include: { product: { include: { priceQuotes: {
      where: {
        source: { in: VERIFIED_SOURCES },
        ...consumerVisibleQuoteWhere("amazon"),
        retailerId: "amazon",
      },
      orderBy: { fetchedAt: "desc" },
      take: 1,
    } } } },
  });

  const quote = identity?.product?.priceQuotes[0];
  if (quote && identity?.product) {
    const catalog = CATALOG.find((c) => c.id === identity.product!.catalogId);
    return {
      hit: true,
      catalogId: identity.product.catalogId,
      catalogItem: catalog,
      priceUsd: quote.priceUsd,
      storeTitle: quote.storeTitle ?? undefined,
      imageUrl: quote.imageUrl ?? undefined,
      productUrl: quote.productUrl || sourceUrl,
      source: quote.source,
      matchConfidence: quote.matchConfidence,
      fetchedAt: quote.fetchedAt.toISOString(),
      lookupMethod: "asin_url",
      normalizationNote: "verified_persisted_quote_via_identifier",
    };
  }

  return { hit: false, productUrl: sourceUrl, lookupMethod: "none", source: "none" };
}

export async function lookupPersistedQuotesForCatalog(
  catalogId: string,
): Promise<PersistedLinkLookup[]> {
  const product = await prisma.product.findUnique({
    where: { catalogId },
    include: {
      priceQuotes: {
        where: {
          source: { in: VERIFIED_SOURCES },
          ...consumerVisibleQuoteWhere(),
        },
        orderBy: { priceUsd: "asc" },
      },
    },
  });
  if (!product) return [];

  const catalog = CATALOG.find((c) => c.id === catalogId);
  return product.priceQuotes.map((q) => ({
    hit: true,
    catalogId,
    catalogItem: catalog,
    priceUsd: q.priceUsd,
    storeTitle: q.storeTitle ?? undefined,
    imageUrl: q.imageUrl ?? undefined,
    productUrl: q.productUrl,
    source: q.source,
    matchConfidence: q.matchConfidence,
    fetchedAt: q.fetchedAt.toISOString(),
    lookupMethod: "catalog_id" as const,
    normalizationNote: "verified_persisted_quote",
  }));
}

export function persistedLookupToLiveQuote(lookup: PersistedLinkLookup) {
  if (!lookup.hit || !lookup.priceUsd) return null;
  const retailerId = "amazon" as RetailerId;
  const meta = getRetailerMeta(retailerId);
  return storedRowToLiveQuoteFields({
    retailerId,
    storeTitle: lookup.storeTitle ?? null,
    imageUrl: lookup.imageUrl ?? null,
    priceUsd: lookup.priceUsd,
    productUrl: lookup.productUrl,
    source: lookup.source,
    sourceLabel: meta.name,
  });
}

export function extractAsinFromAmazonUrl(url: string): string | undefined {
  return extractAmazonAsin(url);
}
