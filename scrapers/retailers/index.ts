import type { RetailerScraper } from "../base/types";
import { createGenericScraper } from "./generic";
import { targetScraper } from "./target";
import { getDomainForRetailer } from "../utils/retailer-domains";

const OVERRIDES: Record<string, RetailerScraper> = {
  target: targetScraper,
};

export function getScraperForRetailer(retailer: string): RetailerScraper | null {
  if (OVERRIDES[retailer]) return OVERRIDES[retailer]!;
  const domain = getDomainForRetailer(retailer);
  if (!domain) return null;
  return createGenericScraper(retailer, domain);
}

export function listSupportedScrapers(): string[] {
  return Object.keys(OVERRIDES);
}
