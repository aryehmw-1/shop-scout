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

function isMarketplaceQuote(quote: LiveQuote): boolean {
  return quote.providerSource === "ebay" || quote.providerSource === "shopsavvy";
}

function liveQuoteKey(quote: LiveQuote): string {
  return quote.externalOfferId || quote.productUrl || `${quote.retailerId}:${quote.storeTitle}`;
}

function applyQuoteMetadata(
  offer: ProductOffer,
  quote: LiveQuote,
): ProductOffer {
  const deliveredTotal = quote.deliveredTotal ?? offer.deliveredTotal ?? offer.landedCost;
  const landedCost = deliveredTotal ?? offer.landedCost;

  return {
    ...offer,
    estimatedShipping: quote.shippingCost ?? offer.estimatedShipping,
    deliveryFee: quote.shippingCost ?? offer.deliveryFee,
    estimatedTax: quote.estimatedTax ?? offer.estimatedTax,
    deliveredTotal,
    landedCost,
    providerSource: quote.providerSource ?? offer.providerSource,
    sellerName: quote.sellerName ?? offer.sellerName,
    sellerFeedbackPct: quote.sellerFeedbackPct ?? offer.sellerFeedbackPct,
    sellerFeedbackScore: quote.sellerFeedbackScore ?? offer.sellerFeedbackScore,
    condition: quote.condition ?? offer.condition,
    returnPolicy: quote.returnPolicy ?? offer.returnPolicy,
    sourceLabel: quote.sourceLabel ?? offer.sourceLabel,
  };
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

  return applyQuoteMetadata({
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
  }, quote);
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

  return applyQuoteMetadata({
    id: `live-${item.id}-${quote.retailerId}-${liveQuoteKey(quote).replace(/[^a-z0-9]+/gi, "-").slice(0, 80)}-${channel}`,
    catalogId: item.id,
    title: liveTitle,
    storeTitle: quote.storeTitle,
    brand: extractBrandFromLiveTitle(quote.storeTitle) ?? item.brand,
    // Only inherit the catalog item's size on a CONFIDENT match. Otherwise this
    // leaks a fallback item's size onto unrelated live offers — e.g. a no-match
    // "air fryer" falls back to the whole-milk catalog item and every air fryer
    // wrongly shows "1 gal". Low-confidence/fallback matches carry no size badge.
    size: matchAnalysis.confidence >= 0.7 ? item.size : "",
    // Don't leak the fallback item's UPC onto a low-confidence live offer either
    // (a wrong barcode can create false "exact" matches downstream).
    upc: matchAnalysis.confidence >= 0.7 ? item.upc : "",
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
  }, quote);
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

  const standardQuoteMap = new Map<RetailerId, LiveQuote>();
  const marketplaceQuotes: LiveQuote[] = [];
  for (const quote of quotes) {
    if (isMarketplaceQuote(quote)) marketplaceQuotes.push(quote);
    else if (!standardQuoteMap.has(quote.retailerId) || quote.verifiedPersistedInventory) {
      standardQuoteMap.set(quote.retailerId, quote);
    }
  }
  let liveCount = 0;

  const searchQ = buildFullSearchQuery(intent);
  const hasPersisted = quotes.some((q) => q.verifiedPersistedInventory);

  const quoteRelevant = (quote: LiveQuote) =>
    options.skipRelevanceFilter ||
    quote.verifiedPersistedInventory ||
    isLiveQuoteRelevant(quote, item, searchQ, intent);

  const patchRow = (offers: ProductOffer[]) =>
    offers.map((o) => {
      const quote = standardQuoteMap.get(o.retailer);
      if (!quote) return o;
      if (!quoteRelevant(quote)) return o;
      liveCount += 1;
      standardQuoteMap.delete(o.retailer);
      return applyLiveToOffer(o, quote, item, intent, livePriceSource);
    });

  const local = patchRow(catalog.local);
  const online = patchRow(catalog.online);
  const zip = catalog.zipCode;

  const existing = new Set([
    ...local.map((o) => o.retailer),
    ...online.map((o) => o.retailer),
  ]);

  for (const quote of standardQuoteMap.values()) {
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

  const existingMarketplace = new Set(
    [...local, ...online].map((offer) => offer.productUrl),
  );
  for (const quote of marketplaceQuotes) {
    if (!quoteRelevant(quote)) continue;
    if (existingMarketplace.has(quote.productUrl)) continue;
    const channel: ShoppingChannel = isRetailerNearZip(zip, quote.retailerId) ?
      "local"
    : "online";
    const offer = buildLiveOffer(item, quote, intent, channel, livePriceSource);
    existingMarketplace.add(quote.productUrl);
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
