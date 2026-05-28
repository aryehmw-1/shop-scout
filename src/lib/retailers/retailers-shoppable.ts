import type { RetailerId } from "../types";
import type { RetailerMeta } from "./meta";

/**
 * Retailers excluded from search & directory — no reliable online product shopping.
 * (Luxury houses without product search, in-store-only, closed, or delivery-only services.)
 */
export const EXCLUDED_RETAILER_IDS = new Set<RetailerId>([
  // Luxury — browse/appointment; no dependable product search URLs
  "louisvuitton",
  "chanel",
  "hermes",
  "dior",
  "gucci",
  "prada",
  "burberry",
  "moncler",
  "bottegaveneta",
  "saintlaurent",
  "mcm",
  // In-store only or no e-commerce catalog
  "ross",
  "burlington",
  // Delivery service, not a product store
  "shipt",
  // Closed / defunct online
  "boxed",
  "buybuybaby",
  "gymboree",
  // Non-US catalogs (demo targets US shoppers)
  "next",
  "indigo",
  "waterstones",
  "fnac",
  "whsmith",
  "dymocks",
]);

export function isShoppableRetailer(id: RetailerId): boolean {
  return !EXCLUDED_RETAILER_IDS.has(id);
}

export function filterShoppableRetailers(retailers: RetailerMeta[]): RetailerMeta[] {
  return retailers.filter((r) => isShoppableRetailer(r.id));
}
