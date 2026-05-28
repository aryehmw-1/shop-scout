import "server-only";

import { createRequire } from "module";
import { buildFullSearchQuery } from "../../shopping/intent-merge";
import type { CatalogItem } from "../../retailers/catalog";
import type { ShoppingIntent } from "../../types";
import { amazonPartnerTag } from "./amazon-paapi-config";
import type { LiveQuote } from "./live-quote";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ProductAdvertisingAPIv1 = require("paapi5-nodejs-sdk") as PaapiSdk;

type PaapiSdk = {
  ApiClient: {
    instance: {
      accessKey: string;
      secretKey: string;
      host: string;
      region: string;
    };
  };
  DefaultApi: new () => {
    searchItems: (
      req: Record<string, unknown>,
      cb: (err: unknown, data: unknown) => void,
    ) => void;
    getItems: (
      req: Record<string, unknown>,
      cb: (err: unknown, data: unknown) => void,
    ) => void;
  };
  SearchItemsRequest: new () => Record<string, unknown>;
  GetItemsRequest: new () => Record<string, unknown>;
  PartnerType: { Associates: string };
};

const RESOURCES = [
  "Images.Primary.Medium",
  "ItemInfo.Title",
  "Offers.Listings.Price",
  "Offers.Listings.SavingBasis",
];

const QUOTE_CACHE = new Map<string, { quotes: LiveQuote[]; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

interface PaapiItem {
  ASIN?: string;
  DetailPageURL?: string;
  ItemInfo?: {
    Title?: { DisplayValue?: string };
  };
  Images?: {
    Primary?: { Medium?: { URL?: string } };
  };
  Offers?: {
    Listings?: Array<{
      Price?: { Amount?: number; DisplayAmount?: string };
    }>;
  };
}

function configureClient(): InstanceType<PaapiSdk["DefaultApi"]> | null {
  const accessKey = process.env.AMAZON_PA_API_ACCESS_KEY?.trim();
  const secretKey = process.env.AMAZON_PA_API_SECRET_KEY?.trim();
  const tag = amazonPartnerTag();
  if (!accessKey || !secretKey || !tag) return null;

  const client = ProductAdvertisingAPIv1.ApiClient.instance;
  client.accessKey = accessKey;
  client.secretKey = secretKey;
  client.host = process.env.AMAZON_PA_API_HOST?.trim() || "webservices.amazon.com";
  client.region = process.env.AMAZON_PA_API_REGION?.trim() || "us-east-1";

  return new ProductAdvertisingAPIv1.DefaultApi();
}

function promisify<T>(
  fn: (cb: (err: unknown, data: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function parsePrice(item: PaapiItem): number | undefined {
  const listing = item.Offers?.Listings?.[0];
  const amount = listing?.Price?.Amount;
  if (typeof amount === "number" && amount > 0) {
    return Math.round(amount * 100) / 100;
  }
  const display = listing?.Price?.DisplayAmount ?? "";
  const m = display.replace(/,/g, "").match(/([\d]+(?:\.\d{2})?)/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
}

function itemToQuote(item: PaapiItem): LiveQuote | null {
  const url = item.DetailPageURL;
  if (!url?.startsWith("https://")) return null;

  const price = parsePrice(item);
  if (!price) return null;

  const title = item.ItemInfo?.Title?.DisplayValue?.trim() || "Amazon listing";

  return {
    retailerId: "amazon",
    price,
    storeTitle: title,
    productUrl: url,
    imageUrl: item.Images?.Primary?.Medium?.URL,
    sourceLabel: "Amazon",
    priceSource: "connector_api",
  };
}

function itemsFromSearchResponse(data: unknown): PaapiItem[] {
  const body = data as { SearchResult?: { Items?: PaapiItem[] } };
  return body.SearchResult?.Items ?? [];
}

function itemsFromGetResponse(data: unknown): PaapiItem[] {
  const body = data as { ItemsResult?: { Items?: PaapiItem[] } };
  return body.ItemsResult?.Items ?? [];
}

async function searchItems(keywords: string, itemCount = 3): Promise<PaapiItem[]> {
  const api = configureClient();
  const tag = amazonPartnerTag();
  if (!api || !tag || !keywords.trim()) return [];

  const searchItemsRequest = new ProductAdvertisingAPIv1.SearchItemsRequest();
  searchItemsRequest.PartnerTag = tag;
  searchItemsRequest.PartnerType = ProductAdvertisingAPIv1.PartnerType.Associates;
  searchItemsRequest.Keywords = keywords.trim().slice(0, 200);
  searchItemsRequest.SearchIndex = "All";
  searchItemsRequest.ItemCount = itemCount;
  searchItemsRequest.Resources = RESOURCES;

  try {
    const data = await promisify<unknown>((cb) =>
      api.searchItems(searchItemsRequest, cb),
    );
    return itemsFromSearchResponse(data);
  } catch (e) {
    console.error("[Amazon PA-API] searchItems failed", e);
    return [];
  }
}

async function getItemsByAsin(asin: string): Promise<PaapiItem[]> {
  const api = configureClient();
  const tag = amazonPartnerTag();
  if (!api || !tag) return [];

  const getItemsRequest = new ProductAdvertisingAPIv1.GetItemsRequest();
  getItemsRequest.PartnerTag = tag;
  getItemsRequest.PartnerType = ProductAdvertisingAPIv1.PartnerType.Associates;
  getItemsRequest.ItemIds = [asin];
  getItemsRequest.Resources = RESOURCES;

  try {
    const data = await promisify<unknown>((cb) => api.getItems(getItemsRequest, cb));
    return itemsFromGetResponse(data);
  } catch (e) {
    console.error("[Amazon PA-API] getItems failed", e);
    return [];
  }
}

/** Live Amazon price + image via Product Advertising API 5.0 (server-only). */
export async function fetchAmazonLiveQuotes(
  intent: ShoppingIntent,
  item: CatalogItem,
): Promise<LiveQuote[]> {
  const cacheKey = `${intent.amazonAsin ?? ""}|${buildFullSearchQuery(intent) || item.title}`;
  const cached = QUOTE_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.quotes;
  }

  let items: PaapiItem[] = [];

  if (intent.amazonAsin?.trim()) {
    items = await getItemsByAsin(intent.amazonAsin.trim());
  }

  if (!items.length) {
    const q = buildFullSearchQuery(intent) || item.title;
    items = await searchItems(q, 5);
  }

  const quotes: LiveQuote[] = [];
  for (const row of items) {
    const quote = itemToQuote(row);
    if (quote) quotes.push(quote);
    if (quotes.length >= 1) break;
  }

  QUOTE_CACHE.set(cacheKey, {
    quotes,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return quotes;
}
