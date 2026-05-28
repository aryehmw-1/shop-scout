import { imageForProduct } from "../catalog-images";
import { pickBestHeroFromOffers } from "./product-image-source";
import type { CatalogItem } from "../retailers/catalog";
import type { MatchedProductSummary, ProductSearchResults } from "../types";
import { isWeakProductImage } from "./product-image-quality";

export function attachMatchedProduct(
  results: ProductSearchResults,
  item: CatalogItem,
  queryHint?: string,
): ProductSearchResults {
  const offers = [...results.local, ...results.online];
  if (!offers.length) return results;

  const cheapest = offers.reduce((a, b) => (a.landedCost < b.landedCost ? a : b));
  const hero = pickBestHeroFromOffers(offers);
  const imageUrl =
    hero?.imageUrl ??
    (cheapest.imageUrl?.startsWith("https://") ?
      cheapest.imageUrl
    : item.imageUrl?.startsWith("https://") && !isWeakProductImage(item.imageUrl) ?
      item.imageUrl
    : imageForProduct(item, queryHint ?? item.title));

  return {
    ...results,
    matchedProduct: {
      title: item.title,
      brand: item.brand,
      imageUrl,
      fromPrice: cheapest.landedCost,
      imageSource:
        hero?.imageSource ??
        cheapest.imageSource ??
        (isWeakProductImage(imageUrl) ? "catalog" : undefined),
    },
  };
}
