import { fetchRetailerPageData } from "../offers/retailer-page-extract";
import { isSearchProductUrl } from "../offers/url-classifier";
import { identifiersFromRecord, mergeIdentifiers } from "../identity/product-identifiers";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductCategory, RetailerId } from "../types";
import type { ProductIdentifiers } from "../identity/types";
import { parseProductUrl, type ParsedProductUrl } from "./url-parser";
import { extractExternalIdsFromUrl, isCoreLinkRetailer } from "./link-url-extract";
import { parseVariantFromTitle } from "./link-variant-parse";
import {
  lookupPersistedQuoteByAsin,
} from "../search/link-persisted-lookup";
import {
  resolveVerifiedInventoryByAsin,
} from "../inventory/verified-inventory-resolver";
import {
  resolveLinkCanonicalProduct,
  type LinkCanonicalResult,
  type LinkMatchTier,
} from "./link-canonical";

export interface LinkIngestResult {
  sourceUrl: string;
  sourceRetailer?: RetailerId;
  hostname: string;
  guessedTitle: string;
  brand: string;
  category?: ProductCategory;
  referencePrice: number;
  priceVerified: boolean;
  priceFromPersistedCache?: boolean;
  normalizationNote?: string;
  imageUrl?: string;
  storeTitle?: string;
  identifiers: ProductIdentifiers;
  externalIds: ReturnType<typeof extractExternalIdsFromUrl>;
  variant: ReturnType<typeof parseVariantFromTitle>;
  catalogId?: string;
  catalogItem?: LinkCanonicalResult["catalogItem"];
  matchTier: LinkMatchTier;
  matchConfidence: number;
  equivalenceReasons: string[];
  variantWarning?: string;
  pdpFetchOk: boolean;
  pdpFetchMs?: number;
  unsupportedRetailer: boolean;
  isSearchUrl: boolean;
  useExactCompare: boolean;
  ingestLatencyMs: number;
}

function brandFromTitle(title: string): string {
  const parts = title.split(/\s+/);
  const first = parts[0];
  if (first && first.length > 2) return first;
  return "Various brands";
}

/**
 * Full link ingestion: URL parse → PDP fetch → identifier extraction → canonical resolution.
 */
export async function ingestLinkProduct(rawUrl: string): Promise<LinkIngestResult | null> {
  const started = Date.now();
  const parsed = parseProductUrl(rawUrl);
  if (!parsed) return null;

  const externalIds = extractExternalIdsFromUrl(rawUrl);
  const identifiers: ProductIdentifiers = mergeIdentifiers(
    externalIds.asin ? { asin: externalIds.asin } : {},
  );

  let title = parsed.guessedTitle;
  let referencePrice = parsed.referencePrice;
  let priceVerified = false;
  let priceFromPersistedCache = false;
  let normalizationNote: string | undefined;
  let imageUrl: string | undefined;
  let storeTitle: string | undefined;
  let pdpFetchOk = false;
  let pdpFetchMs: number | undefined;
  const isSearchUrl = isSearchProductUrl(rawUrl);

  const variant = parseVariantFromTitle(title);

  // Prefer persisted verified quote for known Amazon ASIN before live scrape.
  if (externalIds.asin && parsed.sourceRetailer === "amazon") {
    const verified = await resolveVerifiedInventoryByAsin(externalIds.asin);
    if (verified.hit && verified.quotes[0]?.price) {
      const cached = verified.quotes[0];
      referencePrice = cached.price;
      priceVerified = true;
      priceFromPersistedCache = true;
      normalizationNote = verified.normalizationNote;
      if (cached.storeTitle) {
        storeTitle = cached.storeTitle;
        title = cached.storeTitle;
      }
      if (cached.imageUrl) imageUrl = cached.imageUrl;
      pdpFetchOk = true;
    } else {
      const cached = await lookupPersistedQuoteByAsin(externalIds.asin, rawUrl);
      if (cached.hit && cached.priceUsd) {
        referencePrice = cached.priceUsd;
        priceVerified = true;
        priceFromPersistedCache = true;
        normalizationNote = cached.normalizationNote;
        if (cached.storeTitle) {
          storeTitle = cached.storeTitle;
          title = cached.storeTitle;
        }
        if (cached.imageUrl) imageUrl = cached.imageUrl;
        pdpFetchOk = true;
      }
    }
  }

  if (
    parsed.sourceRetailer &&
    isCoreLinkRetailer(parsed.sourceRetailer) &&
    !isSearchUrl &&
    !priceFromPersistedCache
  ) {
    const fetchStart = Date.now();
    try {
      const page = await fetchRetailerPageData(rawUrl, parsed.sourceRetailer);
      pdpFetchMs = Date.now() - fetchStart;
      if (page) {
        pdpFetchOk = true;
        if (page.storeTitle) {
          storeTitle = page.storeTitle;
          title = page.storeTitle;
        }
        if (page.priceUsd && page.priceUsd > 0) {
          referencePrice = page.priceUsd;
          priceVerified = true;
        }
        if (page.imageUrl) imageUrl = page.imageUrl;
        Object.assign(identifiers, page.identifiers);
      }
    } catch {
      pdpFetchOk = false;
    }
  }

  Object.assign(
    identifiers,
    identifiersFromRecord({
      asin: externalIds.asin,
    }),
  );

  const brand = brandFromTitle(title);

  // If ASIN resolves to persisted inventory, prefer that catalog item for compare.
  let persistedCatalogItem: CatalogItem | undefined;
  if (externalIds.asin && parsed.sourceRetailer === "amazon" && priceFromPersistedCache) {
    const verified = await resolveVerifiedInventoryByAsin(externalIds.asin);
    if (verified.hit && verified.catalogItem) {
      persistedCatalogItem = verified.catalogItem;
    }
  }

  const canonical = await resolveLinkCanonicalProduct({
    title,
    brand,
    category: parsed.category ?? persistedCatalogItem?.category,
    identifiers,
    variant: parseVariantFromTitle(title),
    referencePrice,
  });

  const catalogItem = persistedCatalogItem ?? canonical.catalogItem;
  const catalogId = persistedCatalogItem?.id ?? canonical.catalogId;

  const useExactCompare =
    Boolean(persistedCatalogItem) ||
    canonical.matchTier === "exact" ||
    (canonical.matchTier === "near" && canonical.matchConfidence >= 0.75 && !canonical.variantWarning);

  return {
    sourceUrl: rawUrl,
    sourceRetailer: parsed.sourceRetailer,
    hostname: parsed.hostname,
    guessedTitle: title,
    brand: catalogItem?.brand ?? brand,
    category: parsed.category ?? (catalogItem?.category as ProductCategory | undefined),
    referencePrice,
    priceVerified,
    priceFromPersistedCache,
    normalizationNote,
    imageUrl,
    storeTitle,
    identifiers,
    externalIds,
    variant,
    catalogId,
    catalogItem,
    matchTier: persistedCatalogItem ? "exact" as const : canonical.matchTier,
    matchConfidence: persistedCatalogItem ? 0.95 : canonical.matchConfidence,
    equivalenceReasons: persistedCatalogItem ?
      ["Matched via persisted verified inventory ASIN", ...canonical.equivalenceReasons]
    : canonical.equivalenceReasons,
    variantWarning: canonical.variantWarning,
    pdpFetchOk,
    pdpFetchMs,
    unsupportedRetailer: !parsed.sourceRetailer,
    isSearchUrl,
    useExactCompare,
    ingestLatencyMs: Date.now() - started,
  };
}

export type { ParsedProductUrl, LinkMatchTier };
