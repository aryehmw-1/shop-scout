import {
  classifySizeKind,
  normalizeColor,
  normalizeSizeLabel,
  sizesCompatible,
  type SizeKind,
} from "./size-normalize";
import type { RetailerId, ShoppingIntent } from "../types";

/** One visual variant (color/style) — image lives here, not on each size. */
export interface CatalogVariantGroup {
  id: string;
  color?: string;
  colorNormalized?: string;
  /** Non-color differentiation (e.g. "classic", "slim") when needed */
  styleKey?: string;
  canonicalImageUrl?: string;
  retailerImageUrls?: Partial<Record<RetailerId, string>>;
  imageSource?: string;
  imageConfidence?: number;
  keywords?: string[];
  sizes: CatalogVariantSize[];
  isDefault?: boolean;
}

/** Size row under a variant group — inherits group image unless overridden. */
export interface CatalogVariantSize {
  id: string;
  sizeLabel: string;
  sizeNormalized: string;
  sizeKind: SizeKind;
  gtin?: string;
  basePrice?: number;
  /** Only when this size has a different photo than the group */
  sizeSpecificImageUrl?: string;
  isDefault?: boolean;
}

export function buildVariantGroupId(
  parentId: string,
  color?: string,
  styleKey?: string,
): string {
  if (styleKey) return `${parentId}--${styleKey.replace(/\s+/g, "-").toLowerCase()}`;
  const c = color ? normalizeColor(color).replace(/\s+/g, "-") : "default";
  return `${parentId}--${c}`;
}

export function buildSizeVariantId(
  groupId: string,
  sizeLabel: string,
): string {
  return `${groupId}--${normalizeSizeLabel(sizeLabel).replace(/\s+/g, "-")}`;
}

export function createVariantSize(input: {
  groupId: string;
  sizeLabel: string;
  gtin?: string;
  basePrice?: number;
  sizeSpecificImageUrl?: string;
  isDefault?: boolean;
}): CatalogVariantSize {
  const sizeNormalized = normalizeSizeLabel(input.sizeLabel);
  return {
    id: buildSizeVariantId(input.groupId, input.sizeLabel),
    sizeLabel: input.sizeLabel,
    sizeNormalized,
    sizeKind: classifySizeKind(input.sizeLabel),
    gtin: input.gtin,
    basePrice: input.basePrice,
    sizeSpecificImageUrl: input.sizeSpecificImageUrl,
    isDefault: input.isDefault,
  };
}

export function createVariantGroup(input: {
  parentId: string;
  color?: string;
  styleKey?: string;
  canonicalImageUrl?: string;
  retailerImageUrls?: Partial<Record<RetailerId, string>>;
  keywords?: string[];
  sizes: CatalogVariantSize[];
  isDefault?: boolean;
}): CatalogVariantGroup {
  const colorNormalized = input.color ? normalizeColor(input.color) : undefined;
  const id = buildVariantGroupId(input.parentId, input.color, input.styleKey);
  return {
    id,
    color: input.color,
    colorNormalized,
    styleKey: input.styleKey,
    canonicalImageUrl: input.canonicalImageUrl,
    retailerImageUrls: input.retailerImageUrls,
    keywords: input.keywords,
    sizes: input.sizes.map((s) => ({ ...s, id: s.id || buildSizeVariantId(id, s.sizeLabel) })),
    isDefault: input.isDefault,
  };
}

/** Flat legacy rows → deduplicated visual groups (one group per color/style). */
export function groupFlatVariants(
  parentId: string,
  flat: Array<{
    id: string;
    color?: string;
    colorNormalized?: string;
    sizeLabel: string;
    sizeNormalized?: string;
    sizeKind?: SizeKind;
    gtin?: string;
    imageUrl?: string;
    keywords?: string[];
    basePrice?: number;
    isDefault?: boolean;
  }>,
): CatalogVariantGroup[] {
  const byGroup = new Map<string, CatalogVariantGroup>();

  for (const v of flat) {
    const colorNorm = v.colorNormalized ?? (v.color ? normalizeColor(v.color) : undefined);
    const groupKey = colorNorm ?? "default";
    const groupId = buildVariantGroupId(parentId, v.color);

    let group = byGroup.get(groupKey);
    if (!group) {
      group = {
        id: groupId,
        color: v.color,
        colorNormalized: colorNorm,
        keywords: [],
        sizes: [],
        isDefault: v.isDefault,
      };
      byGroup.set(groupKey, group);
    }

    if (v.isDefault) group.isDefault = true;
    if (v.keywords?.length) {
      group.keywords = [...new Set([...(group.keywords ?? []), ...v.keywords])];
    }
    if (v.imageUrl?.startsWith("https://") && !group.canonicalImageUrl) {
      group.canonicalImageUrl = v.imageUrl;
    }

    group.sizes.push({
      id: v.id,
      sizeLabel: v.sizeLabel,
      sizeNormalized: v.sizeNormalized ?? normalizeSizeLabel(v.sizeLabel),
      sizeKind: v.sizeKind ?? classifySizeKind(v.sizeLabel),
      gtin: v.gtin,
      basePrice: v.basePrice,
      isDefault: v.isDefault,
    });
  }

  return [...byGroup.values()];
}

export function getVariantGroupsForItem(item: {
  id: string;
  variantGroups?: CatalogVariantGroup[];
  variants?: Array<{
    id: string;
    color?: string;
    colorNormalized?: string;
    sizeLabel: string;
    sizeNormalized?: string;
    sizeKind?: SizeKind;
    gtin?: string;
    imageUrl?: string;
    keywords?: string[];
    basePrice?: number;
    isDefault?: boolean;
  }>;
}): CatalogVariantGroup[] {
  if (item.variantGroups?.length) return item.variantGroups;
  if (item.variants?.length) return groupFlatVariants(item.id, item.variants);
  return [];
}

function groupMatchesIntent(
  group: CatalogVariantGroup,
  intent: Pick<ShoppingIntent, "colors">,
): boolean {
  if (!intent.colors?.length) return true;
  const blob = `${group.color ?? ""} ${group.colorNormalized ?? ""} ${(group.keywords ?? []).join(" ")}`.toLowerCase();
  return intent.colors.every((c) => blob.includes(normalizeColor(c)));
}

function pickSize(
  group: CatalogVariantGroup,
  intent: Pick<ShoppingIntent, "size">,
): CatalogVariantSize | undefined {
  if (!group.sizes.length) return undefined;
  if (intent.size) {
    const matched = group.sizes.filter((s) => sizesCompatible(intent.size!, s.sizeLabel));
    if (matched.length === 1) return matched[0];
    if (matched.length > 1) {
      return matched.find((s) => s.isDefault) ?? matched[0];
    }
  }
  return group.sizes.find((s) => s.isDefault) ?? group.sizes[0];
}

export interface PickedVariantGroup {
  group: CatalogVariantGroup;
  size: CatalogVariantSize;
}

export function pickVariantGroupAndSize(
  item: Parameters<typeof getVariantGroupsForItem>[0],
  intent: Pick<ShoppingIntent, "colors" | "size">,
): PickedVariantGroup | undefined {
  const groups = getVariantGroupsForItem(item);
  if (!groups.length) return undefined;

  const matching = groups.filter((g) => groupMatchesIntent(g, intent));
  const pool = matching.length ? matching : groups;
  const group = pool.find((g) => g.isDefault) ?? pool[0]!;
  const size = pickSize(group, intent);
  if (!size) return undefined;
  return { group, size };
}
