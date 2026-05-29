import type { ProductImageSource } from "../types";
import type { RetailerId } from "../types";
import { isGenericCatalogImage, isRetailerHostedImage } from "../indexing/retailer-page-image";
import { isWeakProductImage } from "../search/product-image-quality";
import type { CatalogVariantGroup, CatalogVariantSize } from "./variant-groups";

export type RetailerImageMap = Partial<Record<RetailerId, string>>;

export function parseRetailerImageUrls(json: string | null | undefined): RetailerImageMap {
  if (!json?.trim()) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, string>;
    const out: RetailerImageMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.startsWith("https://")) {
        out[k as RetailerId] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeRetailerImageUrls(map: RetailerImageMap): string {
  return JSON.stringify(map);
}

export interface ResolvedVariantImage {
  url: string;
  source: ProductImageSource;
  fromGroup: boolean;
}

/**
 * Priority: size-specific override → retailer map → canonical group → fallback catalog.
 */
export function resolveVariantGroupImage(
  group: CatalogVariantGroup | null | undefined,
  options: {
    retailerId?: RetailerId;
    size?: CatalogVariantSize | null;
    fallbackCatalogUrl?: string;
  } = {},
): ResolvedVariantImage | undefined {
  const { retailerId, size, fallbackCatalogUrl } = options;

  if (size?.sizeSpecificImageUrl?.startsWith("https://")) {
    return {
      url: size.sizeSpecificImageUrl,
      source: retailerId ? "retailer" : "catalog",
      fromGroup: false,
    };
  }

  if (retailerId && group?.retailerImageUrls?.[retailerId]?.startsWith("https://")) {
    const url = group.retailerImageUrls[retailerId]!;
    return { url, source: "retailer", fromGroup: true };
  }

  if (group?.canonicalImageUrl?.startsWith("https://")) {
    const url = group.canonicalImageUrl;
    const source: ProductImageSource =
      retailerId && isRetailerHostedImage(url, retailerId) ? "retailer"
      : isGenericCatalogImage(url) ? "catalog"
      : "web_search";
    return { url, source, fromGroup: true };
  }

  if (fallbackCatalogUrl?.startsWith("https://") && !isWeakProductImage(fallbackCatalogUrl)) {
    return {
      url: fallbackCatalogUrl,
      source: isGenericCatalogImage(fallbackCatalogUrl) ? "catalog" : "web_search",
      fromGroup: false,
    };
  }

  return undefined;
}

export function mergeRetailerImage(
  existing: RetailerImageMap,
  retailerId: RetailerId,
  imageUrl: string,
  maxPerGroup = 3,
): RetailerImageMap {
  if (!imageUrl.startsWith("https://") || isWeakProductImage(imageUrl)) {
    return existing;
  }
  const next = { ...existing, [retailerId]: imageUrl };
  const keys = Object.keys(next) as RetailerId[];
  if (keys.length <= maxPerGroup) return next;
  const trimmed: RetailerImageMap = {};
  for (const k of keys.slice(0, maxPerGroup)) {
    trimmed[k] = next[k];
  }
  return trimmed;
}
