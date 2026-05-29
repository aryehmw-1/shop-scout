import type { RetailerId } from "../types";
import { getRetailerAdapter, listConfiguredRetailerAdapters } from "./retailer-adapters/index";

/** Internal retailer scrape/enrichment outcome — never shown raw to users. */
export type RetailerEnrichmentStatus =
  | "success"
  | "blocked"
  | "parser_missing"
  | "no_match"
  | "low_confidence";

const ADAPTER_RETAILERS = new Set(listConfiguredRetailerAdapters());

/** Retailers that commonly block datacenter IPs — used for clearer blocked hints. */
export const PROXY_SENSITIVE_RETAILERS = new Set<RetailerId>([
  "walmart",
  "target",
  "kroger",
  "costco",
  "amazon",
]);

export function hasRetailerAdapter(retailerId: RetailerId): boolean {
  return ADAPTER_RETAILERS.has(retailerId) && Boolean(getRetailerAdapter(retailerId));
}

export function inferBlockedFromFetchReason(reason?: string): boolean {
  if (!reason) return false;
  return /bot-wall|blocked|captcha|403|empty-or-blocked|access denied|http-403/i.test(reason);
}

export function inferRetailerStatus(input: {
  retailerId: RetailerId;
  fetchOk: boolean;
  fetchReason?: string;
  parserRan: boolean;
  parserFoundMatch: boolean;
  matchConfidence?: number;
  minConfidence?: number;
}): RetailerEnrichmentStatus {
  const minConf = input.minConfidence ?? 0.58;

  if (!input.fetchOk) {
    if (inferBlockedFromFetchReason(input.fetchReason)) return "blocked";
    if (!hasRetailerAdapter(input.retailerId)) return "parser_missing";
    return "blocked";
  }

  if (!hasRetailerAdapter(input.retailerId)) {
    return input.parserFoundMatch ? "success" : "parser_missing";
  }

  if (!input.parserRan || !input.parserFoundMatch) {
    return "no_match";
  }

  if ((input.matchConfidence ?? 0) < minConf) {
    return "low_confidence";
  }

  return "success";
}
