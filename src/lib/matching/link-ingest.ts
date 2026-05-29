import { fetchRetailerPageData } from "../offers/retailer-page-extract";
import { isSearchProductUrl } from "../offers/url-classifier";
import { identifiersFromRecord, mergeIdentifiers } from "../identity/product-identifiers";
import type { ProductCategory, RetailerId } from "../types";
import type { ProductIdentifiers } from "../identity/types";
import { parseProductUrl, type ParsedProductUrl } from "./url-parser";
import { extractExternalIdsFromUrl, isCoreLinkRetailer } from "./link-url-extract";
import { parseVariantFromTitle } from "./link-variant-parse";
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
  let imageUrl: string | undefined;
  let storeTitle: string | undefined;
  let pdpFetchOk = false;
  let pdpFetchMs: number | undefined;
  const isSearchUrl = isSearchProductUrl(rawUrl);

  const variant = parseVariantFromTitle(title);

  if (parsed.sourceRetailer && isCoreLinkRetailer(parsed.sourceRetailer) && !isSearchUrl) {
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
  const canonical = await resolveLinkCanonicalProduct({
    title,
    brand,
    category: parsed.category,
    identifiers,
    variant: parseVariantFromTitle(title),
    referencePrice,
  });

  const useExactCompare =
    canonical.matchTier === "exact" ||
    (canonical.matchTier === "near" && canonical.matchConfidence >= 0.75 && !canonical.variantWarning);

  return {
    sourceUrl: rawUrl,
    sourceRetailer: parsed.sourceRetailer,
    hostname: parsed.hostname,
    guessedTitle: title,
    brand: canonical.catalogItem?.brand ?? brand,
    category: parsed.category ?? (canonical.catalogItem?.category as ProductCategory | undefined),
    referencePrice,
    priceVerified,
    imageUrl,
    storeTitle,
    identifiers,
    externalIds,
    variant,
    catalogId: canonical.catalogId,
    catalogItem: canonical.catalogItem,
    matchTier: canonical.matchTier,
    matchConfidence: canonical.matchConfidence,
    equivalenceReasons: canonical.equivalenceReasons,
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
