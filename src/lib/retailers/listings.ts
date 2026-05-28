import { imageForProduct } from "../catalog-images";
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
  return size.replace(/^men'?s\s+/i, "Men ").replace(/^women'?s\s+/i, "Women ");
}

/** Store-style product titles (how each retailer names listings) */
function formatStoreTitle(item: CatalogListingItem, retailer: RetailerId): string {
  const b = item.brand;
  const t = item.title;
  const s = sizeLabel(item.size);

  switch (retailer) {
    case "walmart":
      return `${b} ${t}, ${s}`;
    case "target":
      return `${b} ${t} — ${s}`;
    case "amazon":
      return `${b} ${t} | ${s}`;
    case "costco":
      return `${b} ${t} (${s}) - 2 Pack`;
    case "kroger":
    case "publix":
    case "aldi":
      return `${b} ${t}, ${s}`;
    case "macys":
      return `${b}® ${t}, ${s}`;
    case "kohls":
      return `${b} ${t}, Size ${s.replace(/.*\s/, "")}`;
    case "oldnavy":
      return `Old Navy ${t}, ${s}`;
    case "gap":
      return `Gap ${t}, ${s}`;
    case "nike":
      return `${b} ${t}`;
    case "adidas":
      return `${b} ${t} - ${s}`;
    case "zara":
      return `${t.toUpperCase()} - ${s}`;
    case "hm":
    case "uniqlo":
      return `${t} | ${s}`;
    case "gucci":
    case "prada":
    case "louisvuitton":
    case "chanel":
    case "dior":
    case "hermes":
    case "burberry":
    case "moncler":
      return `${b} ${t}`;
    case "levis":
      return `Levi's® ${t} - ${s}`;
    case "ralphlauren":
      return `Polo Ralph Lauren ${t}, ${s}`;
    case "lululemon":
      return `lululemon ${t} | ${s}`;
    case "northface":
      return `The North Face® ${t} - ${s}`;
    case "tjmaxx":
    case "ross":
    case "burlington":
      return `${b} ${t} (${s})`;
    case "footlocker":
    case "zappos":
      return `${b} ${t} - Men's/Women's ${s}`;
    case "barnesnoble":
    case "booksamillion":
    case "powells":
    case "strand":
      return `${t} by ${b} (${s})`;
    case "wayfair":
    case "ikea":
      return `${t} — ${s}`;
    case "casper":
    case "purple":
    case "saatva":
    case "tempurpedic":
      return `${b} ${t} | ${s}`;
    case "brooklinen":
    case "parachute":
    case "potterybarn":
    case "westelm":
      return `${t}, ${s}`;
    default: {
      const store = getRetailerMeta(retailer).name;
      return `${store}: ${b} ${t}, ${s}`;
    }
  }
}

export function getRetailerListing(
  item: CatalogListingItem,
  retailer: RetailerId,
  _channel: ShoppingChannel,
  userQuery?: string,
  intent?: Pick<ShoppingIntent, "colors" | "gender" | "brand" | "size">,
): RetailerListing {
  const imageUrl =
    item.imageUrl?.startsWith("https://")
      ? item.imageUrl
      : imageForProduct(
          {
            id: item.id,
            category: item.category,
            title: item.title,
            brand: item.brand,
            keywords: item.keywords,
          },
          userQuery,
        );

  let storeTitle = formatStoreTitle(item, retailer);
  const color = intent?.colors?.[0];
  if (color && !storeTitle.toLowerCase().includes(color)) {
    storeTitle = `${color.charAt(0).toUpperCase() + color.slice(1)} — ${storeTitle}`;
  }
  if (intent?.size) {
    const sz = intent.size;
    if (!storeTitle.toLowerCase().includes(sz.toLowerCase())) {
      storeTitle = `${storeTitle} · ${sz}`;
    }
  }

  return { storeTitle, imageUrl };
}
