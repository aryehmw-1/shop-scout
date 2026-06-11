// Build a comparable NormalizedListing from any source shape (a raw Bright Data
// record or a catalog product). Keeps all the normalization in one place so the
// matcher/scorer always see consistent, comparable fields.

import {
  inferCategoryKind,
  normalizeBrand,
  normalizeColor,
  normalizeModelNumber,
  normalizePackCount,
  normalizeSize,
  normalizeTitle,
  normalizeVariant,
} from "./normalize";
import type { NormalizedListing } from "./types";

export interface RawListingInput {
  retailer: string;
  retailerDomain?: string | null;
  productUrl?: string | null;
  imageUrl?: string | null;
  title?: string | null;
  brand?: string | null;
  price?: number | null;
  availability?: string | null;
  upcGtin?: string | null;
  gtin?: string | null;
  ean?: string | null;
  modelNumber?: string | null;
  size?: string | null;
  quantity?: string | null;
  unitCount?: number | null;
  color?: string | null;
  variant?: string | null;
  category?: string | null;
}

export function buildNormalizedListing(raw: RawListingInput): NormalizedListing {
  const title = raw.title ?? "";
  const titleNormalized = normalizeTitle(title);
  // Size can be in an explicit field or buried in the title — prefer explicit.
  const sizeParse = normalizeSize(raw.size ?? raw.quantity ?? undefined);
  const sizeFromTitle = sizeParse.value === undefined ? normalizeSize(title) : sizeParse;
  // Pack count likewise: explicit quantity field, else mine the title.
  const packCount =
    normalizePackCount(raw.quantity ?? raw.size ?? undefined) ?? normalizePackCount(title);

  const brandNormalized = normalizeBrand(raw.brand);
  const colorNormalized = normalizeColor(raw.color);
  const variantNormalized = normalizeVariant(raw.variant);

  return {
    retailer: raw.retailer,
    retailerDomain: raw.retailerDomain ?? undefined,
    productUrl: raw.productUrl ?? undefined,
    imageUrl: raw.imageUrl ?? undefined,
    title,
    titleNormalized,
    brand: raw.brand ?? undefined,
    brandNormalized: brandNormalized || undefined,
    price: raw.price ?? undefined,
    availability: raw.availability ?? undefined,
    upc: raw.upcGtin ?? undefined,
    gtin: raw.gtin ?? undefined,
    ean: raw.ean ?? undefined,
    modelNumber: raw.modelNumber ?? undefined,
    modelNumberNormalized: normalizeModelNumber(raw.modelNumber) || undefined,
    size: raw.size ?? undefined,
    sizeNormalized: sizeFromTitle.normalized,
    sizeValue: sizeFromTitle.value,
    sizeUnit: sizeFromTitle.unit,
    packCount,
    unitCount: raw.unitCount ?? undefined,
    color: raw.color ?? undefined,
    colorNormalized: colorNormalized || undefined,
    variant: raw.variant ?? undefined,
    variantNormalized: variantNormalized || undefined,
    category: raw.category ?? undefined,
    categoryKind: inferCategoryKind(raw.category, title),
  };
}
