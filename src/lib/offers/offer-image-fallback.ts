import { imageForProduct } from "../catalog-images";
import type { CatalogItem } from "../retailers/catalog";
import { getRetailerMeta } from "../retailers/meta";
import { primaryDomainForRetailer } from "../matching/url-parser";
import {
  isGenericCatalogImage,
  isRetailerHostedImage,
} from "../indexing/retailer-page-image";
import type { ImageFallbackLevel, OfferPipelineDebug } from "./offer-pipeline-meta";
import { attachPipelineDebug } from "./offer-pipeline-meta";
import type { ProductOffer, ProductImageSource } from "../types";

export interface ResolvedOfferImage {
  url: string;
  level: ImageFallbackLevel;
  method: string;
  imageSource: ProductImageSource;
}

/** Branded text tile when favicon fails. */
export function retailerLogoFallbackUrl(retailer: ProductOffer["retailer"]): string {
  const meta = getRetailerMeta(retailer);
  const label = meta.shortName.slice(0, 12);
  const hex = meta.color.replace("#", "");
  return `https://placehold.co/400x400/${hex}/ffffff?text=${encodeURIComponent(label)}&font=roboto`;
}

export function retailerFaviconUrl(retailer: ProductOffer["retailer"]): string | null {
  const domain = primaryDomainForRetailer(retailer);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=www.${domain}&sz=128`;
}

function brandPlaceholderUrl(brand: string): string | null {
  const b = brand.trim();
  if (!b || b === "Various" || b === "Various brands") return null;
  return `https://placehold.co/400x400/f5f5f4/44403c?text=${encodeURIComponent(b.slice(0, 14))}&font=roboto`;
}

export function resolveOfferImage(
  offer: ProductOffer,
  item?: CatalogItem,
  searchQuery?: string,
): ResolvedOfferImage {
  const img = offer.imageUrl?.trim() ?? "";

  // 1 — Exact PDP image on retailer CDN
  if (
    img.startsWith("https://") &&
    !isGenericCatalogImage(img) &&
    isRetailerHostedImage(img, offer.retailer)
  ) {
    return {
      url: img,
      level: 1,
      method: offer.pipelineDebug?.imageExtractionMethod ?? "pdp_retailer_cdn",
      imageSource: "retailer",
    };
  }

  // 2 — JSON-LD / OG / meta (HTTPS but not retailer-hosted)
  if (img.startsWith("https://") && !isGenericCatalogImage(img)) {
    return {
      url: img,
      level: 2,
      method: offer.pipelineDebug?.imageExtractionMethod ?? "json_ld_og",
      imageSource: offer.imageSource === "web_search" ? "web_search" : "retailer",
    };
  }

  // 3 — Retailer CDN from scrape stored on offer (non-generic)
  if (
    img.startsWith("https://") &&
    !isGenericCatalogImage(img) &&
    offer.imageSource === "retailer"
  ) {
    return {
      url: img,
      level: 3,
      method: "retailer_cdn",
      imageSource: "retailer",
    };
  }

  // 4 — Similar product / catalog variant image (skip generic placeholders)
  if (item && searchQuery) {
    const catalogImg = imageForProduct(item, searchQuery);
    if (catalogImg && !isGenericCatalogImage(catalogImg)) {
      return {
        url: catalogImg,
        level: 4,
        method: "similar_catalog",
        imageSource: "catalog",
      };
    }
  }

  if (item?.imageUrl?.startsWith("https://") && !isGenericCatalogImage(item.imageUrl)) {
    return {
      url: item.imageUrl,
      level: 4,
      method: "catalog_hero",
      imageSource: "catalog",
    };
  }

  // 5 — Brand tile
  const brandUrl = brandPlaceholderUrl(offer.brand || item?.brand || "");
  if (brandUrl) {
    return {
      url: brandUrl,
      level: 5,
      method: "brand_tile",
      imageSource: "catalog",
    };
  }

  // 6 — Retailer favicon / logo
  const favicon = retailerFaviconUrl(offer.retailer);
  if (favicon) {
    return {
      url: favicon,
      level: 6,
      method: "retailer_favicon",
      imageSource: "catalog",
    };
  }

  return {
    url: retailerLogoFallbackUrl(offer.retailer),
    level: 6,
    method: "retailer_logo_tile",
    imageSource: "catalog",
  };
}

export function applyOfferImageFallback(
  offer: ProductOffer,
  item?: CatalogItem,
  searchQuery?: string,
): ProductOffer {
  const resolved = resolveOfferImage(offer, item, searchQuery);
  return attachPipelineDebug(
    {
      ...offer,
      imageUrl: resolved.url,
      imageSource: resolved.imageSource,
    },
    {
      imageFallbackLevel: resolved.level as ImageFallbackLevel,
      imageExtractionMethod: resolved.method,
      imageUrlResolved: resolved.url,
      imageNormalized: resolved.level >= 2,
    },
  );
}
