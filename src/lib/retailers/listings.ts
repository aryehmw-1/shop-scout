import { isGenericCatalogImage } from "../indexing/retailer-page-image";
import { imageForProduct } from "../catalog-images";
import {
  formatStoreListingTitle,
  isSyntheticSize,
} from "../shopping/product-display";
import type { RetailerId, ShoppingChannel, ShoppingIntent } from "../types";
import { getRetailerMeta } from "./meta";

export interface CatalogListingItem {
  id: string;
  title: string;
  brand: string;
  size: string;
  category: string;
  keywords: string[];
  imageUrl?: string;
}

export interface RetailerListing {
  storeTitle: string;
  imageUrl: string;
}

function sizeLabel(size: string): string {
  if (isSyntheticSize(size)) return "";
  return size.replace(/^men'?s\s+/i, "Men ").replace(/^women'?s\s+/i, "Women ");
}

/** Store-style product titles (how each retailer names listings) */
function formatStoreTitle(item: CatalogListingItem, retailer: RetailerId): string {
  const meta = getRetailerMeta(retailer);
  const sized = { ...item, size: sizeLabel(item.size) || item.size };

  switch (retailer) {
    case "oldnavy":
      return formatStoreListingTitle(
        { ...sized, title: `Old Navy ${sized.title}` },
        meta.name,
        "plain",
      );
    case "gap":
      return formatStoreListingTitle(
        { ...sized, title: `Gap ${sized.title}` },
        meta.name,
        "plain",
      );
    case "nike":
    case "adidas":
    case "gucci":
    case "prada":
    case "louisvuitton":
    case "chanel":
    case "dior":
    case "hermes":
    case "burberry":
    case "moncler":
      return formatStoreListingTitle(sized, meta.name, "brand-first");
    case "zara":
      return isSyntheticSize(sized.size) ?
          sized.title.toUpperCase()
        : `${sized.title.toUpperCase()} - ${sized.size}`;
    case "hm":
    case "uniqlo":
      return isSyntheticSize(sized.size) ?
          `${sized.title} | ${meta.name}`
        : `${sized.title} | ${sized.size}`;
    case "shein":
    case "forever21":
      return formatStoreListingTitle(sized, meta.name, "plain");
    default:
      return formatStoreListingTitle(sized, meta.name, "prefix");
  }
}

export function getRetailerListing(
  item: CatalogListingItem,
  retailer: RetailerId,
  _channel: ShoppingChannel,
  userQuery?: string,
  intent?: Pick<ShoppingIntent, "colors" | "gender" | "brand" | "size">,
): RetailerListing {
  // Do not copy one catalog/Unsplash hero onto every retailer card — forces per-retailer fetch.
  let imageUrl = "";
  if (
    item.imageUrl?.startsWith("https://") &&
    !isGenericCatalogImage(item.imageUrl)
  ) {
    imageUrl = item.imageUrl;
  } else {
    const fallback = imageForProduct(
      {
        id: item.id,
        category: item.category,
        title: item.title,
        brand: item.brand,
        keywords: item.keywords,
      },
      userQuery,
    );
    if (fallback?.startsWith("https://") && !isGenericCatalogImage(fallback)) {
      imageUrl = fallback;
    }
  }

  let storeTitle = formatStoreTitle(item, retailer);
  const color = intent?.colors?.[0];
  if (color && !storeTitle.toLowerCase().includes(color)) {
    storeTitle = `${color.charAt(0).toUpperCase() + color.slice(1)} — ${storeTitle}`;
  }
  if (intent?.size && !isSyntheticSize(intent.size)) {
    const sz = intent.size;
    if (!storeTitle.toLowerCase().includes(sz.toLowerCase())) {
      storeTitle = `${storeTitle} · Size ${sz}`;
    }
  }

  return { storeTitle, imageUrl };
}
