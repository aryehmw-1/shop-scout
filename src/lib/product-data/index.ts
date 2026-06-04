import "server-only";

import { imageForProduct } from "../catalog-images";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, ProductSearchResults, RetailerId, ShoppingIntent } from "../types";
import { finalizeSearchPrices } from "../search/price-truth";
import { ebayProvider, isEbayConfigured } from "./ebay";
import { productProviderLog, safeProductProviderReason } from "./http";
import { shopSavvyProvider, isShopSavvyConfigured } from "./shopsavvy";
import type {
  ProductDataProvider,
  ProductDataProviderId,
  ProductSearchResult,
  RetailerOffer,
} from "./types";

const DEFAULT_PROVIDERS: ProductDataProviderId[] = ["ebay", "shopsavvy"];
const MISLEADING_LISTING_TERMS =
  /\b(coin|penny|jersey|shirt|hat|sticker|poster|glass(?:es)?|toy|collectible|vintage|empty box|box only|accessor(?:y|ies)|replacement|part|manual|coupon)\b/i;
const BUNDLE_TERMS =
  /\b(pack of|lot of|bundle|case of|set of|\b\d+\s*(?:pack|pk|ct|count)\b)\b/i;

function enabledProviderIds(): ProductDataProviderId[] {
  const raw = process.env.PRODUCT_DATA_PROVIDERS?.trim();
  if (!raw) return DEFAULT_PROVIDERS;
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is ProductDataProviderId => part === "ebay" || part === "shopsavvy");
}

export function getProductDataProviders(): ProductDataProvider[] {
  const providers: Record<ProductDataProviderId, ProductDataProvider> = {
    ebay: ebayProvider,
    shopsavvy: shopSavvyProvider,
  };

  return enabledProviderIds()
    .map((id) => providers[id])
    .filter((provider) => provider.isConfigured());
}

export function productDataProviderStatus() {
  return {
    enabled: enabledProviderIds(),
    configured: {
      ebay: isEbayConfigured(),
      shopsavvy: isShopSavvyConfigured(),
    },
  };
}

function mergeProduct(existing: ProductSearchResult, next: ProductSearchResult): ProductSearchResult {
  const offers = [...existing.offers];
  const seen = new Set(offers.map((offer) => `${offer.source}:${offer.retailer}:${offer.productUrl}`));

  for (const offer of next.offers) {
    const key = `${offer.source}:${offer.retailer}:${offer.productUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    offers.push(offer);
  }

  return {
    ...existing,
    brand: existing.brand ?? next.brand,
    imageUrl: existing.imageUrl ?? next.imageUrl,
    category: existing.category ?? next.category,
    identifiers: {
      ...next.identifiers,
      ...existing.identifiers,
    },
    offers,
  };
}

export function dedupeProductData(products: ProductSearchResult[]): ProductSearchResult[] {
  const byKey = new Map<string, ProductSearchResult>();

  for (const product of products) {
    const identifiers = product.identifiers;
    const key =
      identifiers.upc ||
      identifiers.asin ||
      identifiers.model ||
      product.canonicalProductId ||
      product.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeProduct(existing, product) : product);
  }

  return [...byKey.values()].sort((a, b) => {
    const aPrice = Math.min(...a.offers.map((offer) => offer.price));
    const bPrice = Math.min(...b.offers.map((offer) => offer.price));
    return aPrice - bPrice;
  });
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|new|free|shipping|ship|ships|gluten|healthy|heart)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length > 2),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const token of a) {
    if (b.has(token)) hits += 1;
  }
  return hits / Math.max(a.size, b.size);
}

function listingRelevance(
  product: ProductSearchResult,
  offer: RetailerOffer,
  item: CatalogItem,
  intent: ShoppingIntent,
): { score: number; reasons: string[] } {
  const listingText = `${offer.title ?? product.title} ${product.brand ?? ""}`;
  const wantedText = `${intent.query || item.title} ${item.brand}`.trim();
  const listingTokens = tokenSet(listingText);
  const wantedTokens = tokenSet(wantedText);
  const reasons: string[] = [];
  let score = 0.45 + overlapScore(wantedTokens, listingTokens) * 0.55;

  const listingLower = listingText.toLowerCase();
  const itemBrand = item.brand.toLowerCase();
  const productBrand = product.brand?.toLowerCase();
  if (itemBrand && listingLower.includes(itemBrand)) {
    score += 0.12;
    reasons.push("brand_match");
  } else if (productBrand && listingLower.includes(productBrand)) {
    score += 0.06;
    reasons.push("provider_brand_match");
  }

  if (item.upc && product.identifiers.upc === item.upc) {
    score += 0.2;
    reasons.push("upc_match");
  }

  if (MISLEADING_LISTING_TERMS.test(listingText)) {
    score -= 0.35;
    reasons.push("possible_non_product_listing");
  }
  if (BUNDLE_TERMS.test(listingText) && !BUNDLE_TERMS.test(intent.query || item.title)) {
    score -= 0.12;
    reasons.push("possible_bundle_or_pack_variation");
  }
  if (offer.condition && /used|parts|not working/i.test(offer.condition)) {
    score -= 0.25;
    reasons.push("condition_penalty");
  }

  return { score: Math.max(0.05, Math.min(0.96, score)), reasons };
}

function dedupeNearDuplicateOffers(offers: ProductOffer[]): ProductOffer[] {
  const groups = new Map<string, ProductOffer>();

  for (const offer of offers) {
    const titleKey = normalizeText(offer.storeTitle ?? offer.title)
      .split(" ")
      .slice(0, 9)
      .join(" ");
    const sellerKey = offer.sellerName ?? "unknown";
    const imageKey = offer.imageUrl.replace(/\?.*$/, "");
    const key = `${offer.retailer}:${sellerKey}:${titleKey}:${imageKey}`;
    const existing = groups.get(key);
    if (!existing || offer.landedCost < existing.landedCost) {
      groups.set(key, offer);
    }
  }

  return [...groups.values()].sort((a, b) => a.landedCost - b.landedCost).slice(0, 12);
}

export async function searchProductDataProviders(query: string): Promise<ProductSearchResult[]> {
  const providers = getProductDataProviders();
  if (!providers.length || query.trim().length < 2) return [];

  const settled = await Promise.allSettled(
    providers.map(async (provider) => {
      const started = Date.now();
      const results = await provider.searchProducts(query);
      productProviderLog("search", {
        provider: provider.id,
        query: query.slice(0, 80),
        productCount: results.length,
        offerCount: results.reduce((sum, product) => sum + product.offers.length, 0),
        latencyMs: Date.now() - started,
      });
      return results;
    }),
  );

  const products: ProductSearchResult[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      products.push(...result.value);
      return;
    }
    productProviderLog("failure", {
      provider: providers[index]?.id,
      reason: safeProductProviderReason(result.reason),
    });
  });

  return dedupeProductData(products);
}

function offerToProductOffer(
  product: ProductSearchResult,
  offer: RetailerOffer,
  item: CatalogItem,
  intent: ShoppingIntent,
  index: number,
): ProductOffer | null {
  if (!offer.productUrl.startsWith("http") || offer.price <= 0) return null;

  const retailer = offer.retailerId ?? (offer.source === "ebay" ? "ebay" : "shopsavvy");
  const imageUrl =
    offer.imageUrl ??
    product.imageUrl ??
    item.imageUrl ??
    imageForProduct(item, product.title);
  const now = offer.lastCheckedAt || new Date().toISOString();
  const expiresAt = new Date(Date.parse(now) + 1000 * 60 * 60 * 6).toISOString();
  const title = offer.title ?? product.title;
  const relevance = listingRelevance(product, offer, item, intent);
  if (relevance.score < 0.42) return null;
  const deliveredTotal =
    offer.shippingCost != null ?
      Math.round((offer.price + offer.shippingCost) * 100) / 100
    : offer.price;

  return {
    id: `provider-${offer.source}-${product.providerProductId}-${index}`,
    catalogId: item.id,
    title,
    storeTitle: title,
    brand: product.brand ?? item.brand,
    size: item.size,
    upc: product.identifiers.upc ?? item.upc,
    imageUrl,
    imageSource: "retailer",
    retailer,
    retailerName:
      offer.source === "shopsavvy" && retailer === "shopsavvy" ?
        offer.retailer
      : offer.retailer,
    channel: "online",
    price: offer.price,
    unitPrice: offer.price,
    unitLabel: item.unitLabel,
    inStock: offer.availability !== "out_of_stock",
    pickupAvailable: false,
    deliveryFee: offer.shippingCost,
    estimatedShipping: offer.shippingCost,
    estimatedTax: undefined,
    deliveredTotal,
    deliveredPriceConfidence: offer.shippingCost != null ? 0.82 : 0.7,
    deliveredPriceNote:
      offer.shippingCost != null ? "Shipping supplied by provider" : "Shipping may change at checkout",
    landedCost: deliveredTotal,
    productUrl: offer.productUrl,
    affiliateUrl: offer.productUrl,
    matchConfidence: relevance.score,
    identityConfidence: relevance.score,
    imageConfidence: imageUrl ? 0.8 : 0.4,
    priceConfidence: 0.86,
    priceSource: "connector_api",
    priceAsOf: now,
    priceExpiresAt: expiresAt,
    lastVerifiedAt: now,
    priceNote:
      offer.source === "ebay" ?
        "Live eBay marketplace price"
      : "ShopSavvy bootstrap price",
    confidenceReasons: relevance.reasons.map((reason) => ({
      code: `provider.${reason}`,
      message: reason.replace(/_/g, " "),
      weight: reason.includes("penalty") || reason.includes("possible") ? -0.2 : 0.2,
    })),
    matchBand: relevance.score >= 0.75 ? "likely_match" : "similar",
    matchDisplayLabel:
      offer.source === "ebay" ?
        relevance.score >= 0.75 ? "Likely eBay match" : "Possible eBay match"
      : "Provider match",
    providerSource: offer.source,
    sellerName: offer.seller?.username,
    condition: offer.condition,
    returnPolicy: offer.returnPolicy,
    sourceLabel: offer.source === "ebay" ? "eBay API" : "ShopSavvy API",
  };
}

export function productDataToSearchResults(
  products: ProductSearchResult[],
  item: CatalogItem,
  intent: ShoppingIntent,
  existing?: ProductSearchResults,
): ProductSearchResults | null {
  const query = intent.query?.trim() || item.title;
  const primary = products.find((product) => product.offers.length > 0);
  if (!primary) return existing ?? null;

  const providerOffers = dedupeNearDuplicateOffers(products
    .flatMap((product) =>
      product.offers.map((offer, index) => offerToProductOffer(product, offer, item, intent, index)),
    )
    .filter((offer): offer is ProductOffer => Boolean(offer)));

  if (!providerOffers.length) return existing ?? null;

  const existingOnline = existing?.online ?? [];
  const seen = new Set(existingOnline.map((offer) => `${offer.retailer}:${offer.productUrl}`));
  const mergedOnline = [...existingOnline];

  for (const offer of providerOffers) {
    const key = `${offer.retailer}:${offer.productUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mergedOnline.push(offer);
  }

  const imageUrl =
    existing?.matchedProduct?.imageUrl ??
    primary.imageUrl ??
    providerOffers[0]?.imageUrl ??
    item.imageUrl;

  return finalizeSearchPrices({
    ...(existing ?? {
      local: [],
      online: [],
      zipCode: intent.zipCode ?? "",
    }),
    online: mergedOnline,
    compareMode: true,
    matchedProduct: {
      title: primary.title || query,
      brand: primary.brand ?? item.brand,
      imageUrl,
      imageSource: "retailer",
      fromPrice: Math.min(...providerOffers.map((offer) => offer.landedCost)),
    },
    retrievalMeta: existing?.retrievalMeta ?? {
      tier: "provider",
      matchedTitle: primary.title,
      matchedBrand: primary.brand,
      normalizationMessage:
        providerOffers.every((offer) => offer.providerSource === "ebay") ?
          "Showing live eBay marketplace pricing."
        : "Showing real prices from connected product data providers.",
      offerQuality: "verified",
    },
  });
}
