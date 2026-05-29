import { attachMatchedProduct } from "./matched-product";
import {
  classifyProductImageSource,
  pickBestHeroFromOffers,
  tagOfferImageSources,
} from "./product-image-source";
import { isGenericCatalogImage } from "../indexing/retailer-page-image";
import { isWeakProductImage } from "./product-image-quality";
import type { CatalogItem } from "../retailers/catalog";
import type {
  ProductImageSource,
  ProductSearchResults,
  RetailerId,
  ShoppingIntent,
} from "../types";
import {
  resolveProductImages,
  type ResolvedWebImage,
} from "./product-image-resolve";

export { buildProductImageSearchQuery } from "./product-image-resolve";

function allOffersWeak(results: ProductSearchResults): boolean {
  const offers = [...results.local, ...results.online];
  return offers.length === 0 || offers.every((o) => isWeakProductImage(o.imageUrl));
}

export async function enrichSearchResultsWithImages(
  results: ProductSearchResults,
  item: CatalogItem,
  intent: ShoppingIntent,
): Promise<ProductSearchResults> {
  let out: ProductSearchResults = {
    ...results,
    local: tagOfferImageSources(results.local),
    online: tagOfferImageSources(results.online),
  };

  out = attachMatchedProduct(out, item, intent.query);

  const hero = pickBestHeroFromOffers([...out.local, ...out.online]);
  if (hero && out.matchedProduct && isWeakProductImage(out.matchedProduct.imageUrl)) {
    out = {
      ...out,
      matchedProduct: {
        ...out.matchedProduct,
        imageUrl: hero.imageUrl,
        imageSource: hero.imageSource,
      },
    };
  }

  const needsWeb =
    allOffersWeak(out) ||
    (out.matchedProduct && isWeakProductImage(out.matchedProduct.imageUrl)) ||
    isWeakProductImage(item.imageUrl);

  if (needsWeb) {
    const resolved = await resolveProductImages(item, intent);
    if (resolved.hero || resolved.perRetailer.size > 0) {
      out = applyWebProductImages(out, resolved.hero, resolved.perRetailer);
    }
  }

  return out;
}

export function applyWebProductImages(
  results: ProductSearchResults,
  hero: ResolvedWebImage | undefined,
  perRetailer: Map<RetailerId, ResolvedWebImage>,
): ProductSearchResults {
  const patchOffer = (o: (typeof results.local)[0]) => {
    const storeImage = perRetailer.get(o.retailer);
    if (storeImage?.url.startsWith("https://")) {
      return {
        ...o,
        imageUrl: storeImage.url,
        imageSource: storeImage.source,
      };
    }
    if (!isWeakProductImage(o.imageUrl)) return o;
    if (
      hero?.url.startsWith("https://") &&
      !isGenericCatalogImage(hero.url)
    ) {
      return { ...o, imageUrl: hero.url, imageSource: hero.source };
    }
    return o;
  };

  const matchedHero =
    hero?.url.startsWith("https://") ?
      hero
    : perRetailer.size > 0 ?
      perRetailer.values().next().value
    : undefined;

  return {
    ...results,
    local: results.local.map(patchOffer),
    online: results.online.map(patchOffer),
    matchedProduct:
      results.matchedProduct && matchedHero ?
        {
          ...results.matchedProduct,
          imageUrl:
            isWeakProductImage(results.matchedProduct.imageUrl) ?
              matchedHero.url
            : results.matchedProduct.imageUrl,
          imageSource:
            isWeakProductImage(results.matchedProduct.imageUrl) ?
              matchedHero.source
            : results.matchedProduct.imageSource ??
              classifyProductImageSource(
                results.matchedProduct.imageUrl,
                results.local[0]?.retailer ?? results.online[0]?.retailer ?? "amazon",
              ),
        }
      : results.matchedProduct,
  };
}

/** @deprecated Use applyWebProductImages */
export function applyWebProductImage(
  results: ProductSearchResults,
  imageUrl: string,
  source: ProductImageSource,
): ProductSearchResults {
  return applyWebProductImages(results, { url: imageUrl, source }, new Map());
}
