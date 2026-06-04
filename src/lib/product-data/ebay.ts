import "server-only";

import {
  cacheKey,
  getCached,
  PRODUCT_DETAIL_TTL_MS,
  PRODUCT_OFFER_TTL_MS,
  PRODUCT_SEARCH_TTL_MS,
  setCached,
} from "./cache";
import { fetchJson, ProductProviderError } from "./http";
import type {
  ProductDataProvider,
  ProductDetails,
  ProductIdentifiers,
  ProductSearchResult,
  RetailerOffer,
} from "./types";

const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";
const DEFAULT_LIMIT = 12;

interface EbayTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface EbayMoney {
  value?: string;
  currency?: string;
}

interface EbayItemSummary {
  itemId?: string;
  title?: string;
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  image?: { imageUrl?: string };
  price?: EbayMoney;
  currentBidPrice?: EbayMoney;
  condition?: string;
  shippingOptions?: Array<{
    shippingCost?: EbayMoney;
    type?: string;
  }>;
  itemLocation?: {
    country?: string;
    postalCode?: string;
  };
  returnTerms?: {
    returnsAccepted?: boolean;
    returnPeriod?: { value?: number; unit?: string };
  };
  categories?: Array<{ categoryName?: string }>;
  seller?: {
    username?: string;
    feedbackPercentage?: string;
    feedbackScore?: number;
  };
  localizedAspects?: Array<{ name?: string; value?: string }>;
}

interface EbaySearchResponse {
  itemSummaries?: EbayItemSummary[];
}

interface EbayItemDetails extends EbayItemSummary {
  description?: string;
  shortDescription?: string;
  additionalImages?: Array<{ imageUrl?: string }>;
  product?: {
    title?: string;
    image?: { imageUrl?: string };
    aspects?: Array<{ name?: string; values?: string[] }>;
  };
}

let tokenCache: { token: string; expiresAt: number } | null = null;

function environment() {
  return process.env.EBAY_ENVIRONMENT?.trim() === "sandbox" ? "sandbox" : "production";
}

function apiBaseUrl() {
  return environment() === "sandbox" ?
      "https://api.sandbox.ebay.com"
    : "https://api.ebay.com";
}

function clientId(): string | undefined {
  return process.env.EBAY_CLIENT_ID?.trim();
}

function clientSecret(): string | undefined {
  return process.env.EBAY_CLIENT_SECRET?.trim();
}

export function isEbayConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

function parsePrice(price?: EbayMoney): number | undefined {
  const raw = price?.value;
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : undefined;
}

function lowestShippingCost(item: EbayItemSummary | EbayItemDetails): number | undefined {
  const costs = (item.shippingOptions ?? [])
    .map((option) => parsePrice(option.shippingCost))
    .filter((price): price is number => price != null);
  if (!costs.length) return undefined;
  return Math.min(...costs);
}

function returnPolicy(item: EbayItemSummary | EbayItemDetails): string | undefined {
  const terms = item.returnTerms;
  if (!terms) return undefined;
  if (terms.returnsAccepted === false) return "Returns not accepted";
  if (terms.returnsAccepted === true) {
    const value = terms.returnPeriod?.value;
    const unit = terms.returnPeriod?.unit?.toLowerCase();
    return value && unit ? `Returns accepted within ${value} ${unit}` : "Returns accepted";
  }
  return undefined;
}

function aspect(
  aspects: Array<{ name?: string; value?: string }> | undefined,
  name: string,
): string | undefined {
  return aspects?.find((a) => a.name?.toLowerCase() === name.toLowerCase())?.value;
}

function productAspect(
  aspects: Array<{ name?: string; values?: string[] }> | undefined,
  name: string,
): string | undefined {
  return aspects?.find((a) => a.name?.toLowerCase() === name.toLowerCase())?.values?.[0];
}

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function ebayItemToProduct(item: EbayItemSummary | EbayItemDetails): ProductSearchResult | null {
  const itemId = item.itemId?.trim();
  const title = item.title?.trim() || (item as EbayItemDetails).product?.title?.trim();
  const price = parsePrice(item.price ?? item.currentBidPrice);
  const url = item.itemAffiliateWebUrl ?? item.itemWebUrl;
  if (!itemId || !title || !price || !url?.startsWith("http")) return null;
  const shippingCost = lowestShippingCost(item);

  const brand =
    aspect(item.localizedAspects, "Brand") ??
    productAspect((item as EbayItemDetails).product?.aspects, "Brand") ??
    title.split(/\s+/)[0];
  const upc =
    aspect(item.localizedAspects, "UPC") ??
    productAspect((item as EbayItemDetails).product?.aspects, "UPC");
  const model =
    aspect(item.localizedAspects, "Model") ??
    productAspect((item as EbayItemDetails).product?.aspects, "Model");
  const sku = aspect(item.localizedAspects, "MPN");
  const imageUrl =
    item.image?.imageUrl ??
    (item as EbayItemDetails).product?.image?.imageUrl ??
    (item as EbayItemDetails).additionalImages?.[0]?.imageUrl;

  const identifiers: ProductIdentifiers = {
    upc,
    model,
    sku,
    ebayItemId: itemId,
  };

  const offer: RetailerOffer = {
    retailer: "eBay",
    retailerId: "ebay",
    price,
    currency: item.price?.currency ?? item.currentBidPrice?.currency ?? "USD",
    availability: "in_stock",
    productUrl: url,
    imageUrl,
    title,
    condition: item.condition,
    shippingCost,
    shippingCurrency: item.price?.currency ?? item.currentBidPrice?.currency ?? "USD",
    returnPolicy: returnPolicy(item),
    seller: item.seller,
    lastCheckedAt: new Date().toISOString(),
    source: "ebay",
  };

  const canonicalKey = upc || model || `${brand}-${title}`;

  return {
    canonicalProductId: `product:${slug(canonicalKey)}`,
    providerProductId: itemId,
    source: "ebay",
    title,
    brand,
    imageUrl,
    category: item.categories?.[0]?.categoryName,
    identifiers,
    offers: [offer],
  };
}

async function getEbayAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const id = clientId();
  const secret = clientSecret();
  if (!id || !secret) {
    throw new ProductProviderError("eBay credentials are not configured.", "ebay", "missing_credentials");
  }

  const credentials = Buffer.from(`${id}:${secret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: EBAY_SCOPE,
  });

  const data = await fetchJson<EbayTokenResponse>(
    "ebay",
    `${apiBaseUrl()}/identity/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      timeoutMs: 10_000,
    },
  );

  const token = data.access_token;
  if (!token) {
    throw new ProductProviderError("eBay token response was missing a token.", "ebay", "token_failed");
  }

  tokenCache = {
    token,
    expiresAt: Date.now() + Math.max((data.expires_in ?? 3600) - 120, 60) * 1000,
  };
  return token;
}

async function ebayFetch<T>(path: string): Promise<T> {
  const token = await getEbayAccessToken();
  return fetchJson<T>("ebay", `${apiBaseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      Accept: "application/json",
    },
    timeoutMs: 12_000,
  });
}

export const ebayProvider: ProductDataProvider = {
  id: "ebay",

  isConfigured: isEbayConfigured,

  async searchProducts(query: string): Promise<ProductSearchResult[]> {
    const q = query.trim();
    if (!q || !isEbayConfigured()) return [];

    const key = cacheKey("ebay", "search", q);
    const cached = getCached<ProductSearchResult[]>(key);
    if (cached) return cached;

    const params = new URLSearchParams({
      q,
      limit: String(DEFAULT_LIMIT),
    });
    const data = await ebayFetch<EbaySearchResponse>(
      `/buy/browse/v1/item_summary/search?${params.toString()}`,
    );

    const products = (data.itemSummaries ?? [])
      .map(ebayItemToProduct)
      .filter((row): row is ProductSearchResult => Boolean(row));

    return setCached(key, products, PRODUCT_SEARCH_TTL_MS);
  },

  async getProductDetails(productId: string): Promise<ProductDetails> {
    const id = productId.trim();
    const key = cacheKey("ebay", "detail", id);
    const cached = getCached<ProductDetails>(key);
    if (cached) return cached;

    const data = await ebayFetch<EbayItemDetails>(
      `/buy/browse/v1/item/${encodeURIComponent(id)}`,
    );
    const product = ebayItemToProduct(data);
    if (!product) {
      throw new ProductProviderError("eBay item could not be normalized.", "ebay", "normalize_failed");
    }

    const details: ProductDetails = {
      ...product,
      description: data.shortDescription ?? data.description,
    };
    return setCached(key, details, PRODUCT_DETAIL_TTL_MS);
  },

  async getOffers(productId: string): Promise<RetailerOffer[]> {
    const id = productId.trim();
    const key = cacheKey("ebay", "offers", id);
    const cached = getCached<RetailerOffer[]>(key);
    if (cached) return cached;

    const details = await this.getProductDetails(id);
    return setCached(key, details.offers, PRODUCT_OFFER_TTL_MS);
  },
};
