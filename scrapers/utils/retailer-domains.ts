/**
 * Retailer → primary domain(s) for demo ingestion.
 * Sourced from src/lib/matching/url-parser.ts (URL_HOST_RETAILER).
 */
import { URL_HOST_RETAILER } from "../../src/lib/matching/url-parser";
import { EXTRA_RETAILER_DOMAINS } from "../config";

export interface RetailerDomainEntry {
  retailer: string;
  domain: string;
}

/** Flat list: one row per host key (156+ domains). */
export function listRetailerDomains(): RetailerDomainEntry[] {
  return Object.entries(URL_HOST_RETAILER).map(([domain, retailer]) => ({
    retailer,
    domain,
  }));
}

/** Unique retailers with a preferred canonical domain (shortest host per retailer). */
export function listUniqueRetailers(): RetailerDomainEntry[] {
  const byRetailer = new Map<string, string>();
  for (const [domain, retailer] of Object.entries(URL_HOST_RETAILER)) {
    const prev = byRetailer.get(retailer);
    if (!prev || domain.length < prev.length) {
      byRetailer.set(retailer, domain);
    }
  }
  for (const [retailer, domain] of Object.entries(EXTRA_RETAILER_DOMAINS)) {
    if (!byRetailer.has(retailer)) byRetailer.set(retailer, domain);
  }
  return [...byRetailer.entries()]
    .map(([retailer, domain]) => ({ retailer, domain }))
    .sort((a, b) => a.retailer.localeCompare(b.retailer));
}

export function getDomainForRetailer(retailer: string): string | undefined {
  if (EXTRA_RETAILER_DOMAINS[retailer]) return EXTRA_RETAILER_DOMAINS[retailer];
  return listUniqueRetailers().find((r) => r.retailer === retailer)?.domain;
}
