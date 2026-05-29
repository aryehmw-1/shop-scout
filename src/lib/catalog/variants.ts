import {
  classifySizeKind,
  normalizeColor,
  normalizeSizeLabel,
  sizesCompatible,
  type SizeKind,
} from "./size-normalize";
import {
  buildVariantGroupId,
  buildSizeVariantId,
  createVariantGroup,
  createVariantSize,
  getVariantGroupsForItem,
  groupFlatVariants,
  pickVariantGroupAndSize,
  type CatalogVariantGroup,
  type CatalogVariantSize,
} from "./variant-groups";
import type { ShoppingIntent } from "../types";

export type { CatalogVariantGroup, CatalogVariantSize };
export { createVariantGroup, createVariantSize, groupFlatVariants, getVariantGroupsForItem };

/** Flat SKU row — legacy; images belong on CatalogVariantGroup. */
export interface CatalogVariant {
  id: string;
  color?: string;
  colorNormalized?: string;
  sizeLabel: string;
  sizeNormalized: string;
  sizeKind: SizeKind;
  gtin?: string;
  /** @deprecated Use variant group canonicalImageUrl */
  imageUrl?: string;
  keywords?: string[];
  basePrice?: number;
  isDefault?: boolean;
}

export interface CatalogVariantParent {
  id: string;
  title: string;
  brand: string;
  category: string;
  keywords: string[];
  variantGroups?: CatalogVariantGroup[];
  /** Legacy flat list — auto-grouped by color */
  variants?: CatalogVariant[];
}

export function buildVariantId(parentId: string, color?: string, size?: string): string {
  if (size) return buildSizeVariantId(buildVariantGroupId(parentId, color), size);
  return buildVariantGroupId(parentId, color);
}

function pickedToFlat(
  parentId: string,
  picked: { group: CatalogVariantGroup; size: CatalogVariantSize },
): CatalogVariant {
  return {
    id: picked.size.id,
    color: picked.group.color,
    colorNormalized: picked.group.colorNormalized,
    sizeLabel: picked.size.sizeLabel,
    sizeNormalized: picked.size.sizeNormalized,
    sizeKind: picked.size.sizeKind,
    gtin: picked.size.gtin,
    imageUrl: picked.group.canonicalImageUrl,
    keywords: picked.group.keywords,
    basePrice: picked.size.basePrice,
    isDefault: picked.size.isDefault ?? picked.group.isDefault,
  };
}

export function variantSearchBlob(v: CatalogVariant): string {
  const kw = v.keywords?.join(" ") ?? "";
  return `${v.color ?? ""} ${v.colorNormalized ?? ""} ${v.sizeLabel} ${v.sizeNormalized} ${kw}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function variantMatchesIntent(
  variant: CatalogVariant,
  intent: Pick<ShoppingIntent, "colors" | "size">,
): boolean {
  if (intent.colors?.length) {
    const blob = variantSearchBlob(variant);
    const ok = intent.colors.every((c) => {
      const n = normalizeColor(c);
      return blob.includes(n);
    });
    if (!ok) return false;
  }
  if (intent.size && !sizesCompatible(intent.size, variant.sizeLabel)) {
    return false;
  }
  return true;
}

export function pickCatalogVariant(
  parent: CatalogVariantParent,
  intent: Pick<ShoppingIntent, "colors" | "size">,
): CatalogVariant | undefined {
  const picked = pickVariantGroupAndSize(parent, intent);
  if (!picked) return undefined;
  return pickedToFlat(parent.id, picked);
}

/** @deprecated Prefer createVariantGroup + createVariantSize */
export function createVariant(input: {
  parentId: string;
  color?: string;
  sizeLabel: string;
  gtin?: string;
  imageUrl?: string;
  keywords?: string[];
  basePrice?: number;
  isDefault?: boolean;
}): CatalogVariant {
  const colorNormalized = input.color ? normalizeColor(input.color) : undefined;
  const sizeNormalized = normalizeSizeLabel(input.sizeLabel);
  return {
    id: buildVariantId(input.parentId, input.color, input.sizeLabel),
    color: input.color,
    colorNormalized,
    sizeLabel: input.sizeLabel,
    sizeNormalized,
    sizeKind: classifySizeKind(input.sizeLabel),
    gtin: input.gtin,
    imageUrl: input.imageUrl,
    keywords: input.keywords,
    basePrice: input.basePrice,
    isDefault: input.isDefault,
  };
}
