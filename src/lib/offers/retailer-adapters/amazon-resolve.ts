import { buildFullSearchQuery } from "../../shopping/intent-merge";
import type { CatalogItem } from "../../retailers/catalog";
import { fetchAmazonLiveQuotes } from "../../search/providers/amazon-paapi";
import { isAmazonPaapiConfigured } from "../../search/providers/amazon-paapi-config";
import type { ShoppingIntent } from "../../types";
import { amazonAdapter } from "./amazon";
import { isAmazonBlockedHtml } from "./retailer-fetch";
import type { RetailerSearchHit } from "./types";
import { isPdpProductUrl, isSearchProductUrl } from "../url-classifier";

export function amazonPaapiFallbackEnabled(): boolean {
  const raw = process.env.INDEX_AMAZON_PAAPI_FALLBACK?.trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return false;
  return true;
}

function hitFromPaapi(
  quote: Awaited<ReturnType<typeof fetchAmazonLiveQuotes>>[0],
): RetailerSearchHit | null {
  if (!quote?.productUrl || !quote.price) return null;
  return {
    pdpUrl: quote.productUrl,
    priceUsd: quote.price,
    storeTitle: quote.storeTitle,
    imageUrl: quote.imageUrl,
    externalId: quote.productUrl.match(/\/dp\/([A-Z0-9]{10})/i)?.[1],
    fromSearchParser: false,
    viaPaapi: true,
  };
}

/** PA-API only — used when HTML fetch fails or is blocked. */
export async function resolveAmazonPaapiFallback(
  item: CatalogItem,
  intent: ShoppingIntent,
  pageUrl?: string,
): Promise<RetailerSearchHit | null> {
  if (!amazonPaapiFallbackEnabled() || !isAmazonPaapiConfigured()) {
    return null;
  }

  const asin =
    pageUrl?.match(/\/dp\/([A-Z0-9]{10})/i)?.[1] ?? intent.amazonAsin?.trim();
  if (asin) {
    const byAsin = await fetchAmazonLiveQuotes({ ...intent, amazonAsin: asin }, item);
    const hit = hitFromPaapi(byAsin[0]);
    if (hit) return hit;
  }

  const q = buildFullSearchQuery(intent) || [item.brand, item.title].filter(Boolean).join(" ");
  const quotes = await fetchAmazonLiveQuotes({ ...intent, query: q }, item);
  return hitFromPaapi(quotes[0]);
}

/** Parse already-fetched Amazon HTML (no network). */
export function resolveAmazonFromHtml(
  html: string,
  resolvedUrl: string,
): RetailerSearchHit | null {
  if (isAmazonBlockedHtml(html)) return null;
  if (isSearchProductUrl(resolvedUrl)) {
    return amazonAdapter.extractSearchResults(html, resolvedUrl);
  }
  if (isPdpProductUrl(resolvedUrl) && amazonAdapter.extractPdpPage) {
    return amazonAdapter.extractPdpPage(html, resolvedUrl);
  }
  return amazonAdapter.extractSearchResults(html, resolvedUrl);
}

/** HTML first, then PA-API if blocked or empty. */
export async function resolveAmazonWithFallback(
  html: string,
  resolvedUrl: string,
  item: CatalogItem,
  intent: ShoppingIntent,
): Promise<RetailerSearchHit | null> {
  const fromHtml = resolveAmazonFromHtml(html, resolvedUrl);
  if (fromHtml && (fromHtml.priceUsd || fromHtml.pdpUrl)) return fromHtml;
  return resolveAmazonPaapiFallback(item, intent, resolvedUrl);
}
