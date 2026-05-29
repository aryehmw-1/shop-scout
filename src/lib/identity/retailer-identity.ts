import type { RetailerId } from "../types";
import { normalizeAttributes } from "./normalize-attributes";
import { identifiersFromRecord } from "./product-identifiers";
import type { ObservedListing, ProductIdentifiers } from "./types";

export interface RetailerProductIdentityInput {
  retailerId: RetailerId;
  externalSku?: string;
  retailerBrandRaw?: string;
  storeTitle: string;
  productUrl: string;
  identifiers: ProductIdentifiers;
  rawAttributesJson: string;
  productId?: string;
  variantGroupId?: string;
  variantId?: string;
}

export interface RetailerOfferInput {
  productId: string;
  variantGroupId?: string;
  variantId?: string;
  retailerId: RetailerId;
  retailerProductIdentityId?: string;
  priceUsd: number;
  inStock: boolean;
  productUrl: string;
  affiliateUrl?: string;
  matchConfidence: number;
  identityConfidence: number;
  attributeConfidence: number;
  imageConfidence: number;
  confidenceReasonsJson: string;
  source: string;
}

export function buildRetailerProductIdentity(
  listing: ObservedListing & { storeTitle: string; productUrl: string },
): RetailerProductIdentityInput {
  const attrs = normalizeAttributes({
    brand: listing.brandRaw,
    color: listing.colorRaw,
    size: listing.sizeRaw,
  });

  return {
    retailerId: listing.retailerId,
    retailerBrandRaw: listing.brandRaw,
    storeTitle: listing.storeTitle,
    productUrl: listing.productUrl,
    identifiers: identifiersFromRecord(listing.identifiers ?? {}),
    rawAttributesJson: JSON.stringify(attrs),
  };
}

export function listingFromOfferRow(row: {
  retailerId: RetailerId;
  storeTitle?: string;
  brand?: string;
  color?: string;
  size?: string;
  productUrl?: string;
  upc?: string;
  gtin?: string;
  mpn?: string;
  priceUsd?: number;
  inStock?: boolean;
}): ObservedListing {
  return {
    retailerId: row.retailerId,
    storeTitle: row.storeTitle,
    brandRaw: row.brand,
    colorRaw: row.color,
    sizeRaw: row.size,
    productUrl: row.productUrl,
    priceUsd: row.priceUsd,
    inStock: row.inStock,
    identifiers: identifiersFromRecord({
      upc: row.upc,
      gtin: row.gtin,
      mpn: row.mpn,
    }),
  };
}
