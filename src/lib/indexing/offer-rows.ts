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
  shippingUsd: number | null;
  estimatedTaxUsd: number | null;
  deliveredTotalUsd: number | null;
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
  providerSource: string | null;
  sourceLabel: string | null;
  externalOfferId: string | null;
  sellerName: string | null;
  condition: string | null;
  returnPolicy: string | null;
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
    shippingUsd: o.estimatedShipping ?? o.deliveryFee ?? null,
    estimatedTaxUsd: o.estimatedTax ?? null,
    deliveredTotalUsd: o.deliveredTotal ?? null,
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
    providerSource: o.providerSource ?? null,
    sourceLabel: o.sourceLabel ?? null,
    externalOfferId: o.providerSource ? o.id : null,
    sellerName: o.sellerName ?? null,
    condition: o.condition ?? null,
    returnPolicy: o.returnPolicy ?? null,
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
  shippingUsd?: number | null;
  estimatedTaxUsd?: number | null;
  deliveredTotalUsd?: number | null;
  landedCostUsd?: number | null;
  productUrl: string;
  source: string;
  sourceLabel?: string;
  providerSource?: string | null;
  externalOfferId?: string | null;
  sellerName?: string | null;
  sellerFeedbackPct?: number | null;
  sellerFeedbackScore?: number | null;
  condition?: string | null;
  returnPolicy?: string | null;
}): {
  retailerId: import("../types").RetailerId;
  price: number;
  storeTitle: string;
  productUrl: string;
  imageUrl?: string;
  sourceLabel: string;
  priceSource?: import("../search/types").PriceSource;
  shippingCost?: number;
  estimatedTax?: number;
  deliveredTotal?: number;
  providerSource?: "ebay" | "shopsavvy";
  externalOfferId?: string;
  sellerName?: string;
  sellerFeedbackPct?: number;
  sellerFeedbackScore?: number;
  condition?: string;
  returnPolicy?: string;
} {
  const providerSource =
    row.providerSource === "ebay" || row.providerSource === "shopsavvy" ?
      row.providerSource
    : undefined;

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
      : row.source === "daily_index" || row.source === "nightly_index" ? "scraped"
      : row.source === "catalog_estimate" ? "catalog_model"
      : "cached_quote",
    shippingCost: row.shippingUsd ?? undefined,
    estimatedTax: row.estimatedTaxUsd ?? undefined,
    deliveredTotal: row.deliveredTotalUsd ?? row.landedCostUsd ?? undefined,
    providerSource,
    externalOfferId: row.externalOfferId ?? undefined,
    sellerName: row.sellerName ?? undefined,
    sellerFeedbackPct: row.sellerFeedbackPct ?? undefined,
    sellerFeedbackScore: row.sellerFeedbackScore ?? undefined,
    condition: row.condition ?? undefined,
    returnPolicy: row.returnPolicy ?? undefined,
  };
}
