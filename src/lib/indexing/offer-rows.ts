import type { ProductOffer, ProductSearchResults } from "../types";

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
  source: string;
  productUrl: string;
  affiliateUrl: string;
  priceAsOf: string | undefined;
}

export function offersToStoredRows(
  results: ProductSearchResults,
  nightlySource: string,
): StoredOfferRow[] {
  const now = new Date().toISOString();

  return [...results.local, ...results.online].slice(0, 80).map((o) => ({
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
    source:
      o.priceSource === "connector_api" ? "connector_api" : nightlySource,
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
      row.source === "connector_api" || row.source === "nightly_index" ?
        row.source
      : "cached_quote",
  };
}
