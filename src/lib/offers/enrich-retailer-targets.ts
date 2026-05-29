import { retailerSellsCategory } from "../retailers/retailers-category";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, RetailerId } from "../types";
import { isGenericCatalogImage } from "../indexing/retailer-page-image";
import { isRetailerHostedImage } from "../indexing/retailer-page-image";
import { isPdpProductUrl, isSearchProductUrl } from "./url-classifier";

/** Stabilize these 5 before expanding retailer coverage. */
export const CORE_RETAILERS: RetailerId[] = [
  "amazon",
  "walmart",
  "target",
  "costco",
  "kroger",
];

export function coreRetailersOnlyEnabled(): boolean {
  const raw = process.env.INDEX_CORE_RETAILERS_ONLY?.trim().toLowerCase();
  return raw !== "off" && raw !== "false" && raw !== "0";
}

/** Major chains — prefer these over off-category discounters for PDP enrichment. */
const ENRICH_PRIORITY: RetailerId[] = [
  "walmart",
  "target",
  "amazon",
  "kroger",
  "costco",
  "sams",
  "heb",
  "aldi",
  "wholefoods",
  "safeway",
  "albertsons",
  "publix",
  "meijer",
  "hyvee",
  "wegmans",
  "sprouts",
  "macys",
  "nordstrom",
  "nike",
  "adidas",
  "gap",
  "oldnavy",
  "levis",
  "dicks",
  "rei",
  "decathlon",
  "instacart",
];

const KIDS_ONLY_RETAILERS = new Set<RetailerId>([
  "gerber",
  "carters",
  "oshkosh",
  "childrensplace",
  "potterybarnkids",
  "buybuybaby",
  "janieandjack",
  "gymboree",
  "primary",
  "hannaandersson",
  "crateandkids",
]);

const APPAREL_PRIORITY: RetailerId[] = [
  "walmart",
  "target",
  "amazon",
  "macys",
  "nordstrom",
  "gap",
  "oldnavy",
  "levis",
  "zara",
  "uniqlo",
  "nike",
  "adidas",
  "kohls",
  "dillards",
];

const GROCERY_PRIORITY: RetailerId[] = [
  "walmart",
  "target",
  "amazon",
  "aldi",
  "kroger",
  "costco",
  "heb",
  "publix",
  "wholefoods",
  "safeway",
  "albertsons",
  "sams",
  "hyvee",
  "wegmans",
  "sprouts",
  "meijer",
];

/** Always attempt PDP fetch for these — even if INDEX_SCRAPE_SKIP_RETAILERS lists them. */
const NEVER_SKIP_RETAILERS = new Set<RetailerId>(["aldi", "kroger", "costco"]);

const DEFAULT_SCRAPE_SKIP: RetailerId[] = ["hm"];

function parseRetailerIdList(raw: string | undefined): RetailerId[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as RetailerId[];
}

/** Retailers skipped during index PDP fetch (12s timeouts, bot walls). */
export function indexScrapeSkipRetailers(): Set<RetailerId> {
  const raw = process.env.INDEX_SCRAPE_SKIP_RETAILERS?.trim();
  if (raw === "none" || raw === "off") return new Set();
  const fromEnv = parseRetailerIdList(raw);
  const ids = fromEnv.length > 0 ? fromEnv : DEFAULT_SCRAPE_SKIP;
  const skip = new Set(ids);
  for (const id of NEVER_SKIP_RETAILERS) {
    skip.delete(id);
  }
  return skip;
}

function isKidsCatalogItem(item: CatalogItem): boolean {
  const blob = `${item.id} ${item.title} ${item.keywords.join(" ")}`.toLowerCase();
  return (
    /\b(toddler|kids?|boys?|girls?|infant|baby|onesie)\b/.test(blob) ||
    item.category === "clothing" && /\bkids\b/.test(blob)
  );
}

function priorityListForItem(item: CatalogItem): RetailerId[] {
  if (coreRetailersOnlyEnabled()) {
    return CORE_RETAILERS.filter((r) => retailerSellsCategory(r, item.category));
  }
  const grocery = new Set([
    "salad",
    "dairy",
    "bakery",
    "produce",
    "meat",
    "pantry",
    "household",
  ]);
  if (grocery.has(item.category)) return GROCERY_PRIORITY;
  if (item.category === "clothing" || item.category === "shoes") {
    return APPAREL_PRIORITY;
  }
  return ENRICH_PRIORITY;
}

function priorityIndex(retailer: RetailerId, item: CatalogItem): number {
  const list = priorityListForItem(item);
  const i = list.indexOf(retailer);
  if (i >= 0) return i;
  const fallback = ENRICH_PRIORITY.indexOf(retailer);
  return fallback >= 0 ? fallback + list.length : list.length + 30;
}

/**
 * Score offers for nightly PDP enrichment (higher = fetch first).
 * Avoids picking the 8 cheapest rows (often Shein, kids brands, off-category).
 */
export function scoreOfferForIndexEnrich(
  offer: ProductOffer,
  item: CatalogItem,
  skip: Set<RetailerId>,
): number {
  if (skip.has(offer.retailer)) return -10_000;

  let score = 0;

  if (isPdpProductUrl(offer.productUrl) && !isSearchProductUrl(offer.productUrl)) {
    score += 200;
  } else if (isSearchProductUrl(offer.productUrl)) {
    score -= 40;
  }

  const pri = priorityIndex(offer.retailer, item);
  score += Math.max(0, 90 - pri * 2);

  if (!retailerSellsCategory(offer.retailer, item.category)) {
    score -= 80;
  }

  if (KIDS_ONLY_RETAILERS.has(offer.retailer) && !isKidsCatalogItem(item)) {
    score -= 150;
  }

  if (
    (item.category === "clothing" || item.category === "shoes") &&
    offer.retailer === "meijer"
  ) {
    score -= 60;
  }

  const needsImage =
    !offer.imageUrl?.startsWith("https://") ||
    isGenericCatalogImage(offer.imageUrl) ||
    !isRetailerHostedImage(offer.imageUrl, offer.retailer);
  if (needsImage) score += 15;

  const needsPrice =
    offer.priceSource !== "scraped" && offer.priceSource !== "connector_api";
  if (needsPrice) score += 10;

  if (offer.priceSource === "catalog_model") score += 5;

  // Deprioritize ultra-cheap estimate outliers used only for sort order.
  score -= Math.min(30, Math.floor(offer.landedCost / 500));

  return score;
}

export function pickOffersForIndexEnrich(
  offers: ProductOffer[],
  item: CatalogItem,
  max: number,
): Array<[RetailerId, ProductOffer]> {
  const skip = indexScrapeSkipRetailers();
  const byRetailer = new Map<RetailerId, ProductOffer>();
  for (const o of offers) {
    if (coreRetailersOnlyEnabled() && !CORE_RETAILERS.includes(o.retailer)) continue;
    if (!byRetailer.has(o.retailer)) byRetailer.set(o.retailer, o);
  }

  const ranked = [...byRetailer.entries()]
    .map(([retailerId, offer]) => ({
      retailerId,
      offer,
      score: scoreOfferForIndexEnrich(offer, item, skip),
    }))
    .filter((r) => r.score > -1000)
    .sort((a, b) => b.score - a.score || a.offer.landedCost - b.offer.landedCost);

  return ranked.slice(0, max).map((r) => [r.retailerId, r.offer]);
}
