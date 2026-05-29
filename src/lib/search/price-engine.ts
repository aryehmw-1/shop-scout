import { imageForProduct } from "../catalog-images";
import { classifyProductImageSource } from "./product-image-source";
import { buildOfferClickUrl } from "../retailers/retailer-url";
import { getRetailerMeta } from "../retailers/meta";
import { getRetailerListing } from "../retailers/listings";
import type { CatalogItem } from "../retailers/catalog";
import { buildFullSearchQuery } from "../shopping/intent-merge";
import type {
  ProductOffer,
  RetailerId,
  ShoppingChannel,
  ShoppingIntent,
} from "../types";
import type { PriceSource } from "./types";
import { applyOfferQualityGates } from "../offers/offer-quality";
import { scoreOfferConfidence } from "../identity/offer-confidence";

const PRICE_SOURCE: PriceSource = "catalog_model";
const QUOTE_TTL_MS = 30 * 60 * 1000;

function hashJitter(seed: string, min: number, max: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  const t = (Math.abs(h) % 1000) / 1000;
  return min + t * (max - min);
}

function parseSizeForUnit(size: string): number {
  const match = size.match(/([\d.]+)\s*(oz|lb|ct|gal)?/i);
  return match ? parseFloat(match[1]) : 1;
}

export function enrichOffer(
  offer: ProductOffer,
  matchConfidence: number,
): ProductOffer {
  const now = new Date().toISOString();
  return {
    ...offer,
    matchConfidence,
    priceSource: PRICE_SOURCE,
    priceAsOf: now,
    priceExpiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
  };
}

export function buildOfferFromCatalog(
  item: CatalogItem,
  retailer: RetailerId,
  intent: ShoppingIntent,
  channel: ShoppingChannel,
  multipliers: Record<RetailerId, number>,
  baseMatchConfidence: number,
): ProductOffer {
  const mult = multipliers[retailer] ?? 1;
  const jitter = hashJitter(`${item.id}-${retailer}`, -0.06, 0.06);
  const price = Math.round(item.basePrice * mult * (1 + jitter) * 100) / 100;
  const wasPrice =
    price < item.basePrice
      ? item.basePrice
      : Math.round(
          price * (1 + hashJitter(item.id + retailer + "was", 0.05, 0.18)) * 100,
        ) / 100;
  const savingsPercent =
    wasPrice > price ? Math.round(((wasPrice - price) / wasPrice) * 100) : undefined;
  const sizeNum = parseSizeForUnit(item.size);
  const unitPrice = Math.round((price / sizeNum) * 100) / 100;
  const searchQ = buildFullSearchQuery(intent);
  const listing = getRetailerListing(item, retailer, channel, searchQ, intent);
  const meta = getRetailerMeta(retailer);
  const { productUrl, affiliateUrl } = buildOfferClickUrl(retailer, item, intent);

  const imageUrl =
    listing.imageUrl?.startsWith("https://") ?
      listing.imageUrl
    : imageForProduct(item, searchQ);

  const confidence = scoreOfferConfidence(item, intent, retailer, {
    storeTitle: listing.storeTitle,
    brand: item.brand,
    color: intent.colors?.[0],
    size: item.size,
    upc: item.upc,
    imageUrl,
    productUrl,
    priceSource: PRICE_SOURCE,
  });

  const offer: ProductOffer = applyOfferQualityGates(
    {
    id: `${item.id}-${retailer}-${channel}`,
    catalogId: item.id,
    title: item.title,
    storeTitle: listing.storeTitle,
    brand: item.brand,
    size: item.size,
    upc: item.upc,
    imageUrl,
    imageSource: classifyProductImageSource(imageUrl, retailer),
    retailer,
    retailerName: meta.name,
    channel,
    price,
    wasPrice: savingsPercent ? wasPrice : undefined,
    savingsPercent,
    unitPrice,
    unitLabel: item.unitLabel,
    inStock: hashJitter(item.id + retailer + "stock", 0, 1) > 0.04,
    pickupAvailable: channel === "local",
    deliveryFee: undefined,
    landedCost: price,
    productUrl,
    affiliateUrl,
    matchConfidence: Math.max(baseMatchConfidence, confidence.matchConfidence),
    identityConfidence: confidence.identityConfidence,
    attributeConfidence: confidence.attributeConfidence,
    imageConfidence: confidence.imageConfidence,
    confidenceReasons: JSON.parse(confidence.confidenceReasonsJson) as ProductOffer["confidenceReasons"],
    priceSource: PRICE_SOURCE,
    priceAsOf: new Date().toISOString(),
    priceExpiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    priceNote:
      channel === "online" ?
        "Ships to your door"
      : retailer === "costco" || retailer === "sams" ?
        "Pickup near you · Members"
      : "Pickup or delivery near you",
    },
    item,
    intent,
  );

  return offer;
}

export function markBestDeals(offers: ProductOffer[]): ProductOffer[] {
  offers.sort((a, b) => a.landedCost - b.landedCost);
  offers.forEach((o, i) => {
    o.isBestDeal = i === 0;
  });
  return offers;
}
