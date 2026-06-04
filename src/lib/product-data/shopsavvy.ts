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
import type { RetailerId } from "../types";

const DEFAULT_BASE_URL = "https://api.shopsavvy.com/v1";
const DEFAULT_LIMIT = 10;

type UnknownRecord = Record<string, unknown>;

function apiKey(): string | undefined {
  return process.env.SHOPSAVVY_API_KEY?.trim();
}

function baseUrl(): string {
  return (process.env.SHOPSAVVY_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
}

export function isShopSavvyConfigured(): boolean {
  return Boolean(apiKey());
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    const n =
      typeof value === "number" ? value
      : typeof value === "string" ? Number(value.replace(/[$,]/g, ""))
      : NaN;
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  return undefined;
}

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function retailerIdForName(name?: string): RetailerId {
  const lower = name?.toLowerCase() ?? "";
  if (lower.includes("amazon")) return "amazon";
  if (lower.includes("walmart")) return "walmart";
  if (lower.includes("target")) return "target";
  if (lower.includes("best buy")) return "bestbuy";
  if (lower.includes("ebay")) return "ebay";
  if (lower.includes("costco")) return "costco";
  if (lower.includes("kroger")) return "kroger";
  return "shopsavvy";
}

function productArrays(data: unknown): unknown[] {
  const root = asRecord(data);
  return [
    ...asArray(root.products),
    ...asArray(root.results),
    ...asArray(root.items),
    ...asArray(asRecord(root.data).products),
    ...asArray(asRecord(root.data).results),
  ];
}

function offerArrays(data: unknown): unknown[] {
  const root = asRecord(data);
  return [
    ...asArray(root.offers),
    ...asArray(root.results),
    ...asArray(asRecord(root.data).offers),
    ...asArray(asRecord(root.data).results),
  ];
}

function offerFromRaw(raw: unknown): RetailerOffer | null {
  const row = asRecord(raw);
  const retailer = stringValue(
    row.retailer,
    row.retailer_name,
    row.retailerName,
    row.merchant,
    row.store,
    row.seller,
  );
  const price = numberValue(row.price, row.current_price, row.currentPrice, row.amount);
  const productUrl = stringValue(row.url, row.product_url, row.productUrl, row.link);
  if (!retailer || !price || !productUrl?.startsWith("http")) return null;

  return {
    retailer,
    retailerId: retailerIdForName(retailer),
    price,
    currency: stringValue(row.currency) ?? "USD",
    availability: stringValue(row.availability, row.stock_status, row.stockStatus) ?? "unknown",
    productUrl,
    imageUrl: stringValue(row.image, row.image_url, row.imageUrl),
    title: stringValue(row.title, row.name),
    condition: stringValue(row.condition),
    lastCheckedAt: new Date().toISOString(),
    source: "shopsavvy",
  };
}

function productFromRaw(raw: unknown): ProductSearchResult | null {
  const row = asRecord(raw);
  const identifiersRaw = asRecord(row.identifiers);
  const title = stringValue(row.name, row.title, row.product_name, row.productName);
  if (!title) return null;

  const id = stringValue(row.id, row.product_id, row.productId, row.slug) ?? slug(title);
  const upc = stringValue(identifiersRaw.upc, row.upc, row.barcode);
  const asin = stringValue(identifiersRaw.asin, row.asin);
  const model = stringValue(identifiersRaw.model, row.model, row.mpn);
  const sku = stringValue(identifiersRaw.sku, row.sku);
  const brand = stringValue(row.brand, row.manufacturer) ?? title.split(/\s+/)[0];
  const imageUrl =
    stringValue(row.image, row.image_url, row.imageUrl) ??
    stringValue(asArray(row.images)[0]);

  const offers = [
    ...asArray(row.offers),
    ...asArray(row.prices),
    ...asArray(row.retailers),
  ]
    .map(offerFromRaw)
    .filter((offer): offer is RetailerOffer => Boolean(offer));

  const identifiers: ProductIdentifiers = { upc, asin, model, sku };
  const canonicalKey = upc || asin || model || sku || `${brand}-${title}`;

  return {
    canonicalProductId: `product:${slug(canonicalKey)}`,
    providerProductId: id,
    source: "shopsavvy",
    title,
    brand,
    imageUrl,
    category: stringValue(row.category, row.category_name, row.categoryName),
    identifiers,
    offers,
  };
}

async function shopSavvyFetch<T>(path: string): Promise<T> {
  const key = apiKey();
  if (!key) {
    throw new ProductProviderError(
      "ShopSavvy API key is not configured.",
      "shopsavvy",
      "missing_credentials",
    );
  }

  return fetchJson<T>("shopsavvy", `${baseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    timeoutMs: 12_000,
  });
}

function identifierParam(productId: string): string {
  if (/^https?:/i.test(productId)) return `url=${encodeURIComponent(productId)}`;
  if (/^[A-Z0-9]{10}$/i.test(productId)) return `asin=${encodeURIComponent(productId)}`;
  if (/^\d{8,14}$/.test(productId)) return `barcode=${encodeURIComponent(productId)}`;
  return `ids=${encodeURIComponent(productId)}`;
}

export const shopSavvyProvider: ProductDataProvider = {
  id: "shopsavvy",

  isConfigured: isShopSavvyConfigured,

  async searchProducts(query: string): Promise<ProductSearchResult[]> {
    const q = query.trim();
    if (!q || !isShopSavvyConfigured()) return [];

    const key = cacheKey("shopsavvy", "search", q);
    const cached = getCached<ProductSearchResult[]>(key);
    if (cached) return cached;

    const searchPath =
      process.env.SHOPSAVVY_SEARCH_PATH?.trim() ||
      `/products/search?query=${encodeURIComponent(q)}&limit=${DEFAULT_LIMIT}`;

    let data: unknown;
    try {
      data = await shopSavvyFetch(searchPath);
    } catch (error) {
      if (
        error instanceof ProductProviderError &&
        (error.status === 404 || error.status === 405)
      ) {
        data = await shopSavvyFetch(
          `/products?query=${encodeURIComponent(q)}&limit=${DEFAULT_LIMIT}`,
        );
      } else {
        throw error;
      }
    }

    const products = productArrays(data)
      .map(productFromRaw)
      .filter((row): row is ProductSearchResult => Boolean(row));

    return setCached(key, products, PRODUCT_SEARCH_TTL_MS);
  },

  async getProductDetails(productId: string): Promise<ProductDetails> {
    const id = productId.trim();
    const key = cacheKey("shopsavvy", "detail", id);
    const cached = getCached<ProductDetails>(key);
    if (cached) return cached;

    const data = await shopSavvyFetch(`/products?${identifierParam(id)}`);
    const product =
      productFromRaw(asRecord(data).product) ??
      productArrays(data).map(productFromRaw).find(Boolean);
    if (!product) {
      throw new ProductProviderError(
        "ShopSavvy product could not be normalized.",
        "shopsavvy",
        "normalize_failed",
      );
    }

    return setCached(key, product, PRODUCT_DETAIL_TTL_MS);
  },

  async getOffers(productId: string): Promise<RetailerOffer[]> {
    const id = productId.trim();
    const key = cacheKey("shopsavvy", "offers", id);
    const cached = getCached<RetailerOffer[]>(key);
    if (cached) return cached;

    const data = await shopSavvyFetch(`/offers?${identifierParam(id)}`);
    const offers = offerArrays(data)
      .map(offerFromRaw)
      .filter((offer): offer is RetailerOffer => Boolean(offer));

    return setCached(key, offers, PRODUCT_OFFER_TTL_MS);
  },
};
