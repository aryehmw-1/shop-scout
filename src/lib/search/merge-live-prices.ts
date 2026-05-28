import { imageForProduct } from "../catalog-images";
import { isRetailerNearZip } from "../retailers/channels";
import { getRetailerMeta } from "../retailers/meta";
import { buildOfferClickUrl } from "../retailers/retailer-url";
import type { CatalogItem } from "../retailers/catalog";
import { buildFullSearchQuery } from "../shopping/intent-merge";
import type {
  ProductOffer,
  ProductSearchResults,
  RetailerId,
  ShoppingChannel,
  ShoppingIntent,
} from "../types";
import { isLiveQuoteRelevant } from "./live-quote-filter";
import { imageSourceForLiveQuote } from "./product-image-source";
import type { LiveQuote } from "./providers/live-quote";
import type { PriceSource } from "./types";

const QUOTE_TTL_MS = 30 * 60 * 1000;

function extractBrandFromLiveTitle(title: string): string | undefined {
  const first = title.split(/\s+/)[0];
  if (!first || first.length < 2) return undefined;
  if (/^(the|a|an|men|women|kids|new)$/i.test(first)) return undefined;
  return first;
}

function markBestDeal(offers: ProductOffer[]) {
  offers.sort((a, b) => a.landedCost - b.landedCost);
  offers.forEach((o, i) => {
    o.isBestDeal = i === 0;
  });
  return offers;
}

function applyLiveToOffer(
  offer: ProductOffer,
  quote: LiveQuote,
  item: CatalogItem,
  intent: ShoppingIntent,
  defaultLivePriceSource: PriceSource,
): ProductOffer {
  const livePriceSource = quote.priceSource ?? defaultLivePriceSource;
  const now = new Date().toISOString();
  const { productUrl, affiliateUrl } = buildOfferClickUrl(
    offer.retailer,
    item,
    intent,
    quote.productUrl,
  );

  const displayTitle = quote.storeTitle.trim() || offer.title;
  const liveImage =
    quote.imageUrl?.startsWith("https://") ? quote.imageUrl : offer.imageUrl;
  const imageSource = imageSourceForLiveQuote(
    liveImage,
    offer.retailer,
    productUrl,
  );

  return {
    ...offer,
    title: displayTitle.length > offer.title.length ? displayTitle : offer.title,
    storeTitle: quote.storeTitle,
    brand:
      offer.brand === "Various" || offer.brand === "Various brands" ?
        extractBrandFromLiveTitle(quote.storeTitle) || offer.brand
      : offer.brand,
    price: quote.price,
    landedCost: quote.price,
    unitPrice: quote.price,
    wasPrice: offer.price > quote.price ? offer.price : offer.wasPrice,
    savingsPercent:
      offer.price > quote.price ?
        Math.round(((offer.price - quote.price) / offer.price) * 100)
      : offer.savingsPercent,
    productUrl,
    affiliateUrl,
    imageUrl: liveImage,
    imageSource,
    matchConfidence: Math.max(offer.matchConfidence, 0.94),
    priceSource: livePriceSource,
    priceAsOf: now,
    priceExpiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    priceNote:
      livePriceSource === "cached_quote" ?
        "Recent price"
      : "Live price",
    inStock: true,
  };
}

function buildLiveOffer(
  item: CatalogItem,
  quote: LiveQuote,
  intent: ShoppingIntent,
  channel: ShoppingChannel,
  defaultLivePriceSource: PriceSource,
): ProductOffer {
  const livePriceSource = quote.priceSource ?? defaultLivePriceSource;
  const meta = getRetailerMeta(quote.retailerId);
  const { productUrl, affiliateUrl } = buildOfferClickUrl(
    quote.retailerId,
    item,
    intent,
    quote.productUrl,
  );
  const now = new Date().toISOString();
  const liveTitle = quote.storeTitle.trim() || item.title;
  const liveImage =
    quote.imageUrl?.startsWith("https://") ?
      quote.imageUrl
    : imageForProduct(item, buildFullSearchQuery(intent));
  const imageSource = imageSourceForLiveQuote(
    liveImage,
    quote.retailerId,
    productUrl,
  );

  return {
    id: `live-${item.id}-${quote.retailerId}-${channel}`,
    catalogId: item.id,
    title: liveTitle,
    storeTitle: quote.storeTitle,
    brand: extractBrandFromLiveTitle(quote.storeTitle) ?? item.brand,
    size: item.size,
    upc: item.upc,
    imageUrl: liveImage,
    imageSource,
    retailer: quote.retailerId,
    retailerName: meta.name,
    channel,
    price: quote.price,
    unitPrice: quote.price,
    unitLabel: item.unitLabel,
    inStock: true,
    pickupAvailable: channel === "local",
    landedCost: quote.price,
    productUrl,
    affiliateUrl,
    matchConfidence: 0.94,
    priceSource: livePriceSource,
    priceAsOf: now,
    priceExpiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    priceNote:
      livePriceSource === "cached_quote" ?
        "Recent price"
      : "Live price",
  };
}

export function mergeLivePrices(
  catalog: ProductSearchResults,
  quotes: LiveQuote[],
  item: CatalogItem,
  intent: ShoppingIntent,
  livePriceSource: PriceSource = "connector_api",
): { results: ProductSearchResults; liveCount: number } {
  if (!quotes.length) {
    return { results: catalog, liveCount: 0 };
  }

  const quoteMap = new Map<RetailerId, LiveQuote>(
    quotes.map((q) => [q.retailerId, q]),
  );
  let liveCount = 0;

  const searchQ = buildFullSearchQuery(intent);

  const patchRow = (offers: ProductOffer[]) =>
    offers.map((o) => {
      const quote = quoteMap.get(o.retailer);
      if (!quote) return o;
      if (!isLiveQuoteRelevant(quote, item, searchQ, intent)) return o;
      liveCount += 1;
      quoteMap.delete(o.retailer);
      return applyLiveToOffer(o, quote, item, intent, livePriceSource);
    });

  const local = patchRow(catalog.local);
  const online = patchRow(catalog.online);
  const zip = catalog.zipCode;

  const existing = new Set([
    ...local.map((o) => o.retailer),
    ...online.map((o) => o.retailer),
  ]);

  for (const quote of quoteMap.values()) {
    if (existing.has(quote.retailerId)) continue;
    if (!isLiveQuoteRelevant(quote, item, searchQ, intent)) continue;
    const channel: ShoppingChannel = isRetailerNearZip(zip, quote.retailerId) ?
      "local"
    : "online";
    const offer = buildLiveOffer(item, quote, intent, channel, livePriceSource);
    if (channel === "local") local.push(offer);
    else online.push(offer);
    liveCount += 1;
  }

  markBestDeal(local);
  markBestDeal(online);

  return {
    results: { ...catalog, local, online },
    liveCount,
  };
}
