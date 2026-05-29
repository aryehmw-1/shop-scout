import type { ProductOffer, ProductSearchResults } from "../types";
import type { CatalogItem } from "../retailers/catalog";
import type { ShoppingIntent } from "../types";
import { filterOffersForPersist } from "../offers/offer-persist-validation";

/** Flat rows for DB insert — prices + image URLs, no blobs. */
export interface StoredOfferRow {
  retailerId: string;
  channel: string;
  storeTitle: string | null;
  imageUrl: string | null;
  priceUsd: number;
  wasPriceUsd: number | null;
  landedCostUsd: number;
  unitPriceUsd: number;
  inStock: boolean;
  matchConfidence: number;
  identityConfidence: number | null;
  attributeConfidence: number | null;
  imageConfidence: number | null;
  confidenceReasonsJson: string;
  variantGroupId: string | null;
  variantId: string | null;
  source: string;
  productUrl: string;
  affiliateUrl: string;
  priceAsOf: string | undefined;
}

/** Persist real scraped/API prices under distinct sources — never label estimates as daily_index. */
export function resolveQuoteDbSource(
  priceSource: ProductOffer["priceSource"],
  nightlySource: string,
): string {
  if (priceSource === "connector_api") return "connector_api";
  if (priceSource === "scraped") return "scraped";
  return "catalog_estimate";
}

export function offersToStoredRows(
  results: ProductSearchResults,
  nightlySource: string,
  options: {
    item?: CatalogItem;
    intent?: ShoppingIntent;
    /** When true (default), only persist validated scraped/API offers. */
    validatedOnly?: boolean;
  } = {},
): StoredOfferRow[] {
  const now = new Date().toISOString();
  let offers = [...results.local, ...results.online];

  const validatedOnly = options.validatedOnly !== false;
  if (validatedOnly && options.item) {
    const { accepted } = filterOffersForPersist(offers, options.item, options.intent);
    offers = accepted;
  }

  return offers.slice(0, 80).map((o) => ({
    retailerId: o.retailer,
    channel: o.channel,
    storeTitle: o.storeTitle ?? o.title ?? null,
    imageUrl: o.imageUrl?.startsWith("https://") ? o.imageUrl : null,
    priceUsd: o.price,
    wasPriceUsd: o.wasPrice ?? null,
    landedCostUsd: o.landedCost,
    unitPriceUsd: o.unitPrice,
    inStock: o.inStock,
    matchConfidence: o.matchConfidence,
    identityConfidence: o.identityConfidence ?? null,
    attributeConfidence: o.attributeConfidence ?? null,
    imageConfidence: o.imageConfidence ?? null,
    confidenceReasonsJson: JSON.stringify(o.confidenceReasons ?? []),
    variantGroupId: null,
    variantId: null,
    source: resolveQuoteDbSource(o.priceSource, nightlySource),
    productUrl: o.productUrl,
    affiliateUrl: o.affiliateUrl,
    priceAsOf: o.priceAsOf ?? now,
  }));
}

export function storedRowToLiveQuoteFields(row: {
  retailerId: string;
  storeTitle: string | null;
  imageUrl: string | null;
  priceUsd: number;
  productUrl: string;
  source: string;
  sourceLabel?: string;
}): {
  retailerId: import("../types").RetailerId;
  price: number;
  storeTitle: string;
  productUrl: string;
  imageUrl?: string;
  sourceLabel: string;
  priceSource?: import("../search/types").PriceSource;
} {
  return {
    retailerId: row.retailerId as import("../types").RetailerId,
    price: row.priceUsd,
    storeTitle: row.storeTitle?.trim() || row.sourceLabel || row.retailerId,
    productUrl: row.productUrl,
    imageUrl: row.imageUrl ?? undefined,
    sourceLabel: row.sourceLabel ?? row.retailerId,
    priceSource:
      row.source === "scraped" ? "scraped"
      : row.source === "connector_api" ? "connector_api"
      : row.source === "catalog_estimate" ? "catalog_model"
      : row.source === "daily_index" || row.source === "nightly_index" ?
        "daily_index"
      : "cached_quote",
  };
}
