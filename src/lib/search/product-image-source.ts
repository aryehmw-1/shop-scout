import { productUrlMatchesRetailer } from "../matching/url-parser";
import type { ProductImageSource, ProductOffer, RetailerId } from "../types";
import { isWeakProductImage } from "./product-image-quality";

const WEB_IMAGE_HOST =
  /google\.|gstatic\.|ggpht|serpapi\.|bing\.|pinimg|facebook\.|fbcdn/i;

/**
 * Retailer = image URL is hosted on that store's domain.
 * Web search = Google Shopping / Google Images thumbnail (not the store's CDN).
 * Catalog = placeholder or demo stock image.
 */
export function classifyProductImageSource(
  imageUrl: string | undefined,
  retailerId: RetailerId,
): ProductImageSource {
  if (isWeakProductImage(imageUrl)) return "catalog";

  try {
    if (productUrlMatchesRetailer(imageUrl!, retailerId)) {
      return "retailer";
    }
    const host = new URL(imageUrl!).hostname.toLowerCase();
    if (WEB_IMAGE_HOST.test(host)) return "web_search";
  } catch {
    return "catalog";
  }

  return "web_search";
}

export function imageSourceForLiveQuote(
  imageUrl: string | undefined,
  retailerId: RetailerId,
  productUrl: string,
): ProductImageSource {
  if (!imageUrl?.startsWith("https://")) return "catalog";
  const fromHost = classifyProductImageSource(imageUrl, retailerId);
  if (fromHost === "retailer") return "retailer";
  if (productUrlMatchesRetailer(productUrl, retailerId)) {
    return "web_search";
  }
  return fromHost;
}

export function tagOfferImageSources(offers: ProductOffer[]): ProductOffer[] {
  return offers.map((o) => ({
    ...o,
    imageSource: classifyProductImageSource(o.imageUrl, o.retailer),
  }));
}

export function pickBestHeroFromOffers(
  offers: ProductOffer[],
): { imageUrl: string; imageSource?: ProductImageSource } | undefined {
  const retailer = offers.find(
    (o) => o.imageSource === "retailer" && !isWeakProductImage(o.imageUrl),
  );
  if (retailer) {
    return { imageUrl: retailer.imageUrl, imageSource: "retailer" };
  }
  const web = offers.find(
    (o) => o.imageSource === "web_search" && !isWeakProductImage(o.imageUrl),
  );
  if (web) {
    return { imageUrl: web.imageUrl, imageSource: "web_search" };
  }
  const any = offers.find((o) => !isWeakProductImage(o.imageUrl));
  if (any) {
    return {
      imageUrl: any.imageUrl,
      imageSource: any.imageSource ?? classifyProductImageSource(any.imageUrl, any.retailer),
    };
  }
  return undefined;
}
