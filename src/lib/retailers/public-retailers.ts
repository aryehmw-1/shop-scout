import type { RetailerId } from "../types";
import type { RetailerMeta } from "./meta";
import { RETAILERS } from "./meta";
import type { CanonicalCatalogResult, CanonicalProduct } from "../demo-commerce/canonical/types";
import type { DemoCatalogResult } from "../demo-commerce/types";

/** Hidden from marketing, directory, and compare UI until affiliate integrations are live. */
export const TEMPORARILY_HIDDEN_RETAILERS = new Set<RetailerId>([
  "walmart",
  "target",
]);

export const RETAILER_TRADEMARK_DISCLAIMER =
  "Retailer names and trademarks belong to their respective owners. Inclusion does not imply affiliation or endorsement.";

export function isPublicRetailer(id: RetailerId): boolean {
  return !TEMPORARILY_HIDDEN_RETAILERS.has(id);
}

export function filterPublicRetailerIds<T extends RetailerId>(ids: readonly T[]): T[] {
  return ids.filter((id) => isPublicRetailer(id));
}

export function filterPublicRetailers(retailers: readonly RetailerMeta[]): RetailerMeta[] {
  return retailers.filter((r) => isPublicRetailer(r.id));
}

/** Shoppable retailers shown in public UI copy and store directory. */
export const PUBLIC_RETAILERS: RetailerMeta[] = filterPublicRetailers(RETAILERS);

export const PUBLIC_SHOPPABLE_STORE_COUNT = PUBLIC_RETAILERS.length;

export function filterPublicOffers<T extends { retailer: RetailerId }>(offers: readonly T[]): T[] {
  return offers.filter((o) => isPublicRetailer(o.retailer));
}

export function filterPublicCanonicalProduct(product: CanonicalProduct): CanonicalProduct {
  const offers = product.offers.filter((o) => isPublicRetailer(o.retailer));
  return { ...product, offers };
}

export function filterPublicCanonicalCatalog(
  catalog: CanonicalCatalogResult,
): CanonicalCatalogResult {
  const products = catalog.products
    .map(filterPublicCanonicalProduct)
    .filter((p) => p.offers.length >= 2);
  const retailers = filterPublicRetailerIds(
    [...new Set(products.flatMap((p) => p.offers.map((o) => o.retailer)))],
  ).sort();
  return {
    ...catalog,
    products,
    total: products.length,
    retailers,
  };
}

export function filterPublicDemoCatalog(catalog: DemoCatalogResult): DemoCatalogResult {
  const products = catalog.products.filter((p) =>
    isPublicRetailer(p.retailer as RetailerId),
  );
  const retailers = filterPublicRetailerIds(
    [...new Set(products.map((p) => p.retailer as RetailerId))],
  ).sort();
  return {
    ...catalog,
    products,
    total: products.length,
    retailers,
  };
}
