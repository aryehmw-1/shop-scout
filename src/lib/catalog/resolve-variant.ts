import type { CatalogItem } from "../retailers/catalog";
import type { ShoppingIntent } from "../types";
import { resolveVariantGroupImage } from "./variant-group-images";
import {
  getVariantGroupsForItem,
  pickVariantGroupAndSize,
  type CatalogVariantGroup,
  type CatalogVariantSize,
} from "./variant-groups";

/** @deprecated Use CatalogVariantSize — kept for gradual migration */
export type { CatalogVariantSize as CatalogVariant };

export interface ResolvedCatalogRow {
  item: CatalogItem;
  variantGroup?: CatalogVariantGroup;
  size?: CatalogVariantSize;
}

/**
 * Resolve visual variant group + size, merge attributes for search/pricing,
 * and inherit image from the group (not per-size rows).
 */
export function resolveCatalogRow(
  item: CatalogItem,
  intent: ShoppingIntent,
): ResolvedCatalogRow {
  const picked = pickVariantGroupAndSize(item, intent);
  if (!picked) return { item };

  const { group, size } = picked;
  const resolvedImage = resolveVariantGroupImage(group, {
    size,
    fallbackCatalogUrl: item.imageUrl,
  });

  const merged: CatalogItem = {
    ...item,
    size: size.sizeLabel || item.size,
    upc: size.gtin || item.upc,
    basePrice: size.basePrice ?? item.basePrice,
    imageUrl: resolvedImage?.url ?? item.imageUrl,
    keywords: [
      ...new Set([
        ...item.keywords,
        ...(group.keywords ?? []),
        ...(group.colorNormalized ? [group.colorNormalized, group.color!] : []),
        size.sizeNormalized,
      ]),
    ],
  };

  if (group.color && !merged.title.toLowerCase().includes(group.color.toLowerCase())) {
    merged.title = `${group.color} ${merged.title}`.replace(/\s+/g, " ").trim();
  }

  return { item: merged, variantGroup: group, size };
}

export function getActiveVariantGroup(
  item: CatalogItem,
  intent: ShoppingIntent,
): CatalogVariantGroup | undefined {
  return pickVariantGroupAndSize(item, intent)?.group ?? getVariantGroupsForItem(item)[0];
}
