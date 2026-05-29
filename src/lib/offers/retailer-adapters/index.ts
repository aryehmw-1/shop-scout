import type { RetailerId } from "../../types";
import { aldiAdapter } from "./aldi";
import { amazonAdapter } from "./amazon";
import { costcoAdapter } from "./costco";
import { krogerAdapter } from "./kroger";
import { targetAdapter } from "./target";
import { walmartAdapter } from "./walmart";
import type { RetailerPageAdapter, RetailerSearchHit } from "./types";
import { isSearchProductUrl, isPdpProductUrl } from "../url-classifier";

const ADAPTERS: Partial<Record<RetailerId, RetailerPageAdapter>> = {
  walmart: walmartAdapter,
  target: targetAdapter,
  amazon: amazonAdapter,
  aldi: aldiAdapter,
  kroger: krogerAdapter,
  costco: costcoAdapter,
};

export function retailerAdaptersEnabled(): boolean {
  const raw = process.env.INDEX_RETAILER_ADAPTERS?.trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return false;
  return true;
}

export function getRetailerAdapter(
  retailerId: RetailerId,
): RetailerPageAdapter | undefined {
  if (!retailerAdaptersEnabled()) return undefined;
  return ADAPTERS[retailerId];
}

export function listConfiguredRetailerAdapters(): RetailerId[] {
  return Object.keys(ADAPTERS) as RetailerId[];
}

export function applyAdapterHitToExtraction(
  base: {
    finalUrl: string;
    urlKind: ReturnType<typeof import("../url-classifier").classifyProductUrl>;
    imageUrl?: string;
    priceUsd?: number;
    storeTitle?: string;
    canonicalPdpUrl?: string;
    identifiers: import("../../identity/types").ProductIdentifiers;
    searchResolved?: boolean;
    resolvedVia?: "html" | "paapi_fallback";
  },
  hit: RetailerSearchHit,
): typeof base {
  const next = {
    ...base,
    searchResolved: hit.fromSearchParser === true || hit.viaPaapi === true,
    resolvedVia: hit.viaPaapi ? ("paapi_fallback" as const) : base.resolvedVia,
  };

  if (hit.pdpUrl && isPdpProductUrl(hit.pdpUrl)) {
    next.canonicalPdpUrl = hit.pdpUrl;
  }
  if (hit.imageUrl && !next.imageUrl) next.imageUrl = hit.imageUrl;
  if (hit.storeTitle && !next.storeTitle) next.storeTitle = hit.storeTitle;
  if (hit.priceUsd && !next.priceUsd) next.priceUsd = hit.priceUsd;

  if (hit.externalId && hit.fromSearchParser) {
    if (base.finalUrl.includes("amazon.com")) {
      next.identifiers = { ...next.identifiers, asin: hit.externalId };
    }
  }

  return next;
}

export function shouldRunSearchAdapter(pageUrl: string): boolean {
  return isSearchProductUrl(pageUrl);
}

export { type RetailerSearchHit, type RetailerPageAdapter };
