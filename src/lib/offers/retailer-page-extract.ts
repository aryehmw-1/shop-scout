import { retailerIdFromProductUrl } from "../matching/url-parser";
import {
  extractProductImageFromHtml,
  isGenericCatalogImage,
} from "../indexing/retailer-page-image";
import {
  extractIdentifiersFromJsonLd,
  mergeIdentifiers,
} from "../identity/product-identifiers";
import type { ProductIdentifiers } from "../identity/types";
import type { CatalogItem } from "../retailers/catalog";
import type { RetailerId, ShoppingIntent } from "../types";
import {
  applyAdapterHitToExtraction,
  getRetailerAdapter,
  shouldRunSearchAdapter,
} from "./retailer-adapters";
import {
  resolveAmazonPaapiFallback,
  resolveAmazonWithFallback,
} from "./retailer-adapters/amazon-resolve";
import { fetchRetailerHtmlWithRetries } from "./retailer-adapters/retailer-fetch";
import { classifyProductUrl, isPdpProductUrl, isSearchProductUrl } from "./url-classifier";

export interface FetchRetailerPageContext {
  catalogItem?: CatalogItem;
  intent?: ShoppingIntent;
}

export interface RetailerPageExtraction {
  finalUrl: string;
  urlKind: ReturnType<typeof classifyProductUrl>;
  imageUrl?: string;
  priceUsd?: number;
  storeTitle?: string;
  canonicalPdpUrl?: string;
  identifiers: ProductIdentifiers;
  source: "retailer_page";
  /** Price + PDP resolved from retailer-specific search parser (Walmart/Target/Amazon). */
  searchResolved?: boolean;
  resolvedVia?: "html" | "paapi_fallback";
}

function linkCanonical(html: string, baseUrl: string): string | undefined {
  const m =
    html.match(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    ) ??
    html.match(
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
    );
  if (!m?.[1]) return undefined;
  try {
    return new URL(m[1], baseUrl).href;
  } catch {
    return undefined;
  }
}

function parsePriceFromJsonLd(html: string): number | undefined {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    try {
      const json = JSON.parse(block[1]!) as unknown;
      const price = findOfferPrice(json);
      if (price) return price;
    } catch {
      /* skip */
    }
  }
  return undefined;
}

function findOfferPrice(node: unknown): number | undefined {
  if (!node || typeof node !== "object") return undefined;
  const obj = node as Record<string, unknown>;
  const type = String(obj["@type"] ?? "").toLowerCase();

  if (type.includes("product") || obj.offers) {
    const offers = obj.offers;
    const p = priceFromOffersNode(offers);
    if (p) return p;
  }

  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) {
      for (const child of v) {
        const p = findOfferPrice(child);
        if (p) return p;
      }
    } else if (v && typeof v === "object") {
      const p = findOfferPrice(v);
      if (p) return p;
    }
  }
  return undefined;
}

function priceFromOffersNode(offers: unknown): number | undefined {
  if (!offers) return undefined;
  const list = Array.isArray(offers) ? offers : [offers];
  const candidates: number[] = [];
  for (const o of list) {
    if (!o || typeof o !== "object") continue;
    const offer = o as Record<string, unknown>;
    const spec = offer.priceSpecification;
    const specList = Array.isArray(spec) ? spec : spec ? [spec] : [];
    for (const s of specList) {
      if (!s || typeof s !== "object") continue;
      const row = s as Record<string, unknown>;
      const n = parsePriceValue(row.price ?? row.lowPrice);
      if (n) candidates.push(n);
    }
    for (const key of ["lowPrice", "price", "highPrice"] as const) {
      const n = parsePriceValue(offer[key]);
      if (n) candidates.push(n);
    }
  }
  if (!candidates.length) return undefined;
  return Math.min(...candidates);
}

function parsePriceFromMeta(html: string): number | undefined {
  const patterns = [
    /property=["']og:price:amount["'][^>]+content=["']([^"']+)["']/i,
    /property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i,
    /itemprop=["']price["'][^>]+content=["']([^"']+)["']/i,
    /data-test=["']product-price["'][^>]*>\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /"currentPrice"\s*:\s*([\d.]+)/i,
    /"price"\s*:\s*"?\$?([\d,]+(?:\.\d{2})?)"/i,
  ];
  const found: number[] = [];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    const n = parsePriceValue(m[1]);
    if (n) found.push(n);
  }
  return found.length ? Math.min(...found) : undefined;
}

function parsePriceValue(raw: unknown): number | undefined {
  if (typeof raw === "number" && raw > 0 && raw < 1_000_000) {
    return Math.round(raw * 100) / 100;
  }
  if (typeof raw === "string") {
    const m = raw.replace(/,/g, "").match(/([\d]+(?:\.\d{2})?)/);
    if (!m) return undefined;
    const n = parseFloat(m[1]!);
    if (Number.isFinite(n) && n > 0 && n < 1_000_000) {
      return Math.round(n * 100) / 100;
    }
  }
  return undefined;
}

function productTitleFromJsonLd(html: string): string | undefined {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    try {
      const json = JSON.parse(block[1]!) as unknown;
      const title = findProductName(json);
      if (title) return title;
    } catch {
      /* skip */
    }
  }
  return undefined;
}

function findProductName(node: unknown): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const obj = node as Record<string, unknown>;
  const type = String(obj["@type"] ?? "").toLowerCase();
  if (type.includes("product") && typeof obj.name === "string") {
    return obj.name.trim();
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) {
      for (const child of v) {
        const t = findProductName(child);
        if (t) return t;
      }
    } else if (v && typeof v === "object") {
      const t = findProductName(v);
      if (t) return t;
    }
  }
  return undefined;
}

function identifiersFromJsonLdHtml(html: string): ProductIdentifiers {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  let merged: ProductIdentifiers = {};
  for (const block of blocks) {
    try {
      const json = JSON.parse(block[1]!) as unknown;
      merged = collectProductIds(json, merged);
    } catch {
      /* skip */
    }
  }
  return merged;
}

function collectProductIds(
  node: unknown,
  out: ProductIdentifiers,
): ProductIdentifiers {
  if (!node || typeof node !== "object") return out;
  const obj = node as Record<string, unknown>;
  const type = String(obj["@type"] ?? "").toLowerCase();
  let merged = out;
  if (type.includes("product")) {
    merged = mergeIdentifiers(merged, extractIdentifiersFromJsonLd(obj));
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) {
      for (const child of v) {
        merged = collectProductIds(child, merged);
      }
    } else if (v && typeof v === "object") {
      merged = collectProductIds(v, merged);
    }
  }
  return merged;
}

export function extractFromRetailerHtml(
  html: string,
  pageUrl: string,
): Omit<RetailerPageExtraction, "source"> {
  const finalUrl = pageUrl;
  const canonical = linkCanonical(html, pageUrl);
  const canonicalPdpUrl =
    canonical && isPdpProductUrl(canonical) ? canonical : undefined;
  const urlKind = classifyProductUrl(canonicalPdpUrl ?? pageUrl);

  const imageUrl = extractProductImageFromHtml(html, pageUrl);
  const jsonLdPrice = parsePriceFromJsonLd(html);
  const metaPrice = parsePriceFromMeta(html);
  const priceUsd =
    jsonLdPrice && metaPrice ?
      Math.min(jsonLdPrice, metaPrice)
    : jsonLdPrice ?? metaPrice;
  const storeTitle = productTitleFromJsonLd(html);
  const identifiers = identifiersFromJsonLdHtml(html);

  return {
    finalUrl,
    urlKind,
    imageUrl:
      imageUrl && !isGenericCatalogImage(imageUrl) ? imageUrl : undefined,
    priceUsd,
    storeTitle,
    canonicalPdpUrl,
    identifiers,
    searchResolved: undefined,
  };
}

function mergeExtractions(
  base: Omit<RetailerPageExtraction, "source">,
  patch: Partial<Omit<RetailerPageExtraction, "source">>,
): Omit<RetailerPageExtraction, "source"> {
  return {
    ...base,
    ...patch,
    identifiers: { ...base.identifiers, ...patch.identifiers },
    imageUrl: patch.imageUrl ?? base.imageUrl,
    priceUsd: patch.priceUsd ?? base.priceUsd,
    storeTitle: patch.storeTitle ?? base.storeTitle,
    canonicalPdpUrl: patch.canonicalPdpUrl ?? base.canonicalPdpUrl,
    searchResolved: patch.searchResolved ?? base.searchResolved,
  };
}

async function applyRetailerAdapter(
  html: string,
  resolvedUrl: string,
  retailerId: RetailerId,
  extracted: Omit<RetailerPageExtraction, "source">,
  context?: FetchRetailerPageContext,
): Promise<Omit<RetailerPageExtraction, "source">> {
  if (retailerId === "amazon" && context?.catalogItem && context?.intent) {
    const hit = await resolveAmazonWithFallback(
      html,
      resolvedUrl,
      context.catalogItem,
      context.intent,
    );
    if (hit) {
      return applyAdapterHitToExtraction(
        { ...extracted, resolvedVia: hit.viaPaapi ? "paapi_fallback" : "html" },
        hit,
      );
    }
    return extracted;
  }

  const adapter = getRetailerAdapter(retailerId);
  if (!adapter) return extracted;

  if (shouldRunSearchAdapter(resolvedUrl)) {
    const hit = adapter.extractSearchResults(html, resolvedUrl);
    if (hit) {
      return applyAdapterHitToExtraction({ ...extracted, resolvedVia: "html" }, hit);
    }
    return extracted;
  }

  if (adapter.extractPdpPage && isPdpProductUrl(resolvedUrl)) {
    const hit = adapter.extractPdpPage(html, resolvedUrl);
    if (hit) {
      return applyAdapterHitToExtraction({ ...extracted, resolvedVia: "html" }, hit);
    }
  }

  return extracted;
}

export async function fetchRetailerPageData(
  pageUrl: string,
  retailerId: RetailerId,
  context?: FetchRetailerPageContext,
): Promise<RetailerPageExtraction | null> {
  if (!pageUrl.startsWith("https://")) return null;
  if (retailerIdFromProductUrl(pageUrl) !== retailerId) return null;

  try {
    const first = await fetchRetailerHtmlWithRetries(pageUrl, retailerId);
    if (!first) {
      if (retailerId === "amazon" && context?.catalogItem && context?.intent) {
        const hit = await resolveAmazonPaapiFallback(
          context.catalogItem,
          context.intent,
          pageUrl,
        );
        if (!hit) return null;
        const base = extractFromRetailerHtml("", pageUrl);
        const extracted = applyAdapterHitToExtraction(
          { ...base, resolvedVia: hit.viaPaapi ? "paapi_fallback" : "html" },
          hit,
        );
        return {
          ...extracted,
          finalUrl: pageUrl,
          urlKind: classifyProductUrl(extracted.canonicalPdpUrl ?? pageUrl),
          source: "retailer_page",
        };
      }
      return null;
    }

    let extracted = await applyRetailerAdapter(
      first.html,
      first.resolvedUrl,
      retailerId,
      extractFromRetailerHtml(first.html, first.resolvedUrl),
      context,
    );

    const pdpUrl = extracted.canonicalPdpUrl;
    const needsPdpFetch =
      pdpUrl &&
      isPdpProductUrl(pdpUrl) &&
      pdpUrl !== first.resolvedUrl &&
      (!extracted.priceUsd || !extracted.imageUrl) &&
      extracted.resolvedVia !== "paapi_fallback";

    if (needsPdpFetch) {
      const pdp = await fetchRetailerHtmlWithRetries(pdpUrl, retailerId);
      if (pdp) {
        let pdpExtract = extractFromRetailerHtml(pdp.html, pdp.resolvedUrl);
        pdpExtract = await applyRetailerAdapter(
          pdp.html,
          pdp.resolvedUrl,
          retailerId,
          pdpExtract,
          context,
        );
        extracted = mergeExtractions(extracted, {
          ...pdpExtract,
          canonicalPdpUrl: pdpUrl,
          finalUrl: pdp.resolvedUrl,
          searchResolved: extracted.searchResolved ?? pdpExtract.searchResolved,
        });
      }
    }

    const finalKind = classifyProductUrl(
      extracted.canonicalPdpUrl ?? first.resolvedUrl,
    );

    const row: RetailerPageExtraction = {
      ...extracted,
      finalUrl: extracted.finalUrl ?? first.resolvedUrl,
      urlKind: finalKind,
      source: "retailer_page",
    };

    if (process.env.PIPELINE_DEBUG === "1") {
      console.log("[retailer-adapter]", retailerId, {
        url: pageUrl.slice(0, 80),
        searchResolved: row.searchResolved,
        resolvedVia: row.resolvedVia,
        price: row.priceUsd,
        pdp: row.canonicalPdpUrl?.slice(0, 80),
        hasImage: Boolean(row.imageUrl),
        proxy: first.proxyUsed,
        attempt: first.attempt,
      });
    }

    return row;
  } catch {
    return null;
  }
}
