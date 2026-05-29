import { loadVariantGroupsForCatalog } from "../catalog/load-group-images";
import { resolveCatalogRow } from "../catalog/resolve-variant";
import { resolveVariantGroupImage } from "../catalog/variant-group-images";
import { isGenericCatalogImage } from "../indexing/retailer-page-image";
import { imageSourceForLiveQuote } from "./product-image-source";
import { fetchProductImageFromOpenFoodFacts } from "./providers/open-food-facts-images";
import { fetchProductImageFromOpenverse } from "./providers/openverse-images";
import { fetchLiveQuotes } from "./fetch-live-quotes";
import type { LiveQuote } from "./providers/live-quote";
import { isWeakProductImage } from "./product-image-quality";
import { productUrlMatchesRetailer } from "../matching/url-parser";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductImageSource, RetailerId } from "../types";
import type { ShoppingIntent } from "../types";
import { buildFullSearchQuery } from "../shopping/intent-merge";

export function buildProductImageSearchQuery(
  item: CatalogItem,
  intent: ShoppingIntent,
): string {
  const fromIntent = buildFullSearchQuery(intent);
  if (fromIntent.length >= 4) return fromIntent;

  const brand =
    item.brand && !/^various/i.test(item.brand) ? item.brand : "";
  return [brand, item.title, item.size !== "1 unit" ? item.size : ""]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ResolvedWebImage {
  url: string;
  source: ProductImageSource;
}

export interface ResolvedProductImages {
  hero?: ResolvedWebImage;
  perRetailer: Map<RetailerId, ResolvedWebImage>;
}

function pickHeroFromQuotes(quotes: LiveQuote[]): ResolvedWebImage | undefined {
  for (const quote of quotes) {
    if (
      quote.imageUrl &&
      !isWeakProductImage(quote.imageUrl) &&
      productUrlMatchesRetailer(quote.imageUrl, quote.retailerId)
    ) {
      return {
        url: quote.imageUrl,
        source: "retailer",
      };
    }
  }
  for (const quote of quotes) {
    if (quote.imageUrl && !isWeakProductImage(quote.imageUrl)) {
      return {
        url: quote.imageUrl,
        source: imageSourceForLiveQuote(
          quote.imageUrl,
          quote.retailerId,
          quote.productUrl,
        ),
      };
    }
  }
  return undefined;
}

function buildPerRetailerImages(quotes: LiveQuote[]): Map<RetailerId, ResolvedWebImage> {
  const map = new Map<RetailerId, ResolvedWebImage>();

  for (const quote of quotes) {
    if (!quote.imageUrl || isWeakProductImage(quote.imageUrl)) continue;
    map.set(quote.retailerId, {
      url: quote.imageUrl,
      source: imageSourceForLiveQuote(
        quote.imageUrl,
        quote.retailerId,
        quote.productUrl,
      ),
    });
  }

  return map;
}

/**
 * Product photos (no SerpAPI / no Google API):
 * 1. Catalog image on the item
 * 2. Open Food Facts (grocery UPC)
 * 3. Amazon PA-API image on the Amazon offer row only
 * 4. Openverse hero fallback for the main card
 */
export async function resolveProductImages(
  item: CatalogItem,
  intent: ShoppingIntent,
): Promise<ResolvedProductImages> {
  const perRetailer = new Map<RetailerId, ResolvedWebImage>();
  let hero: ResolvedWebImage | undefined;

  if (!isWeakProductImage(item.imageUrl)) {
    hero = { url: item.imageUrl, source: "catalog" };
  }

  if (item.upc && !item.upc.startsWith("syn-")) {
    const fromOff = await fetchProductImageFromOpenFoodFacts(item.upc, item.category);
    if (fromOff) {
      hero = { url: fromOff, source: "web_search" };
    }
  }

  const query = buildProductImageSearchQuery(item, intent);
  const { quotes } = await fetchLiveQuotes(intent, item);
  const fromQuotes = buildPerRetailerImages(quotes);
  for (const [id, img] of fromQuotes) {
    perRetailer.set(id, img);
  }

  const dbGroups = await loadVariantGroupsForCatalog(item.id);
  const catalogItem: CatalogItem =
    dbGroups.length ? { ...item, variantGroups: dbGroups } : item;
  const { variantGroup, size } = resolveCatalogRow(catalogItem, intent);

  if (variantGroup) {
    for (const [retailerId, url] of Object.entries(
      variantGroup.retailerImageUrls ?? {},
    )) {
      if (url?.startsWith("https://")) {
        perRetailer.set(retailerId as RetailerId, {
          url,
          source: "retailer",
        });
      }
    }
    const groupHero = resolveVariantGroupImage(variantGroup, {
      size: size ?? undefined,
      fallbackCatalogUrl: item.imageUrl,
    });
    if (
      groupHero &&
      (!hero || isGenericCatalogImage(hero.url))
    ) {
      hero = { url: groupHero.url, source: groupHero.source };
    }
  }

  if (!hero) {
    hero = pickHeroFromQuotes(quotes);
  }

  if (!hero) {
    const fromOpenverse = await fetchProductImageFromOpenverse(query);
    if (fromOpenverse) {
      hero = { url: fromOpenverse, source: "web_search" };
    }
  }

  if (!hero && perRetailer.size > 0) {
    hero = perRetailer.values().next().value;
  }

  return { hero, perRetailer };
}
