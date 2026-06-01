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
import { analyzeProductMatch } from "../offers/product-match-analysis";
import { isLiveQuoteRelevant } from "./live-quote-filter";
import { imageSourceForLiveQuote } from "./product-image-source";
import type { LiveQuote } from "./providers/live-quote";
import type { PriceSource } from "./types";
import {
  computePersistExpiresAt,
} from "../pricing/quote-freshness-policy";

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
  const now = quote.fetchedAt ?? new Date().toISOString();
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

  const persisted = quote.verifiedPersistedInventory === true;

  const listingTitle = quote.storeTitle.trim() || offer.title;
  const matchAnalysis = analyzeProductMatch(listingTitle, item, intent, quote.matchConfidence);

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
    matchConfidence: matchAnalysis.confidence,
    matchBand: matchAnalysis.band,
    matchDisplayLabel: matchAnalysis.displayLabel,
    packSizeLabel: matchAnalysis.packSizeLabel,
    identityConfidence: quote.identityConfidence ?? matchAnalysis.confidence,
    imageConfidence: quote.imageConfidence ?? 0.75,
    confidenceReasons: [
      ...(quote.confidenceReasons ?? offer.confidenceReasons ?? []),
      ...matchAnalysis.reasons,
    ],
    priceSource: livePriceSource,
    priceAsOf: now,
    priceExpiresAt:
      quote.expiresAt ??
      computePersistExpiresAt(new Date(now), offer.retailer).toISOString(),
    priceNote: persisted ? "Recently verified price" : livePriceSource === "cached_quote" ? "Recently verified" : "Verified live price",
    inStock: true,
    verifiedPersistedInventory: persisted || offer.verifiedPersistedInventory,
    normalizationStatus: quote.normalizationNote,
    qaStatus: quote.qaStatus ?? offer.qaStatus,
    lastVerifiedAt: quote.fetchedAt ?? offer.lastVerifiedAt,
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

  const persisted = quote.verifiedPersistedInventory === true;
  const matchAnalysis = analyzeProductMatch(liveTitle, item, intent, quote.matchConfidence);

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
    matchConfidence: matchAnalysis.confidence,
    matchBand: matchAnalysis.band,
    matchDisplayLabel: matchAnalysis.displayLabel,
    packSizeLabel: matchAnalysis.packSizeLabel,
    identityConfidence: quote.identityConfidence ?? matchAnalysis.confidence,
    imageConfidence: quote.imageConfidence ?? 0.75,
    confidenceReasons: [
      ...(quote.confidenceReasons ?? []),
      ...matchAnalysis.reasons,
    ],
    priceSource: livePriceSource,
    priceAsOf: quote.fetchedAt ?? now,
    priceExpiresAt:
      quote.expiresAt ??
      computePersistExpiresAt(new Date(now), quote.retailerId).toISOString(),
    priceNote: persisted ? "Recently verified price" : livePriceSource === "cached_quote" ? "Recently verified" : "Verified live price",
    verifiedPersistedInventory: persisted,
    normalizationStatus: quote.normalizationNote,
    qaStatus: quote.qaStatus,
    lastVerifiedAt: quote.fetchedAt,
  };
}

export function mergeLivePrices(
  catalog: ProductSearchResults,
  quotes: LiveQuote[],
  item: CatalogItem,
  intent: ShoppingIntent,
  livePriceSource: PriceSource = "connector_api",
  options: { skipRelevanceFilter?: boolean } = {},
): { results: ProductSearchResults; liveCount: number } {
  if (!quotes.length) {
    return { results: catalog, liveCount: 0 };
  }

  const quoteMap = new Map<RetailerId, LiveQuote>(
    quotes.map((q) => [q.retailerId, q]),
  );
  let liveCount = 0;

  const searchQ = buildFullSearchQuery(intent);
  const hasPersisted = quotes.some((q) => q.verifiedPersistedInventory);

  const quoteRelevant = (quote: LiveQuote) =>
    options.skipRelevanceFilter ||
    quote.verifiedPersistedInventory ||
    isLiveQuoteRelevant(quote, item, searchQ, intent);

  const patchRow = (offers: ProductOffer[]) =>
    offers.map((o) => {
      const quote = quoteMap.get(o.retailer);
      if (!quote) return o;
      if (!quoteRelevant(quote)) return o;
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
    if (!quoteRelevant(quote)) continue;
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
    results: {
      ...catalog,
      local,
      online,
      verifiedInventoryHit: hasPersisted ? catalog.verifiedInventoryHit : undefined,
    },
    liveCount,
  };
}
