import type { CatalogVariantGroup } from "../catalog/variant-groups";
import {
  mergeRetailerImage,
  parseRetailerImageUrls,
  serializeRetailerImageUrls,
  type RetailerImageMap,
} from "../catalog/variant-group-images";
import { imageQualityToJson, pickBestImage } from "../identity/image-quality";
import type { RetailerId } from "../types";
import { prisma } from "./prisma";

export interface StoredVariantGroup {
  id: string;
  catalogGroupId: string;
  color: string | null;
  colorNormalized: string | null;
  canonicalImageUrl: string | null;
  retailerImageUrls: RetailerImageMap;
  imageSource: string | null;
  imageConfidence: number | null;
  lastVerifiedAt: Date | null;
}

export function groupImageStale(lastVerifiedAt: Date | null, maxAgeDays = 7): boolean {
  if (!lastVerifiedAt) return true;
  const ageMs = Date.now() - lastVerifiedAt.getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}

export async function loadVariantGroup(
  productId: string,
  catalogGroupId: string,
): Promise<StoredVariantGroup | null> {
  const row = await prisma.variantGroup.findUnique({
    where: {
      productId_catalogGroupId: { productId, catalogGroupId },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    catalogGroupId: row.catalogGroupId,
    color: row.color,
    colorNormalized: row.colorNormalized,
    canonicalImageUrl: row.canonicalImageUrl,
    retailerImageUrls: parseRetailerImageUrls(row.retailerImageUrlsJson),
    imageSource: row.imageSource,
    imageConfidence: row.imageConfidence,
    lastVerifiedAt: row.lastVerifiedAt,
  };
}

export async function upsertVariantGroupImages(
  productDbId: string,
  group: CatalogVariantGroup,
  patch: {
    canonicalImageUrl?: string | null;
    retailerImageUrls?: RetailerImageMap;
    imageSource?: string;
    imageConfidence?: number;
    touchVerified?: boolean;
  },
): Promise<StoredVariantGroup> {
  const existing = await prisma.variantGroup.findUnique({
    where: {
      productId_catalogGroupId: {
        productId: productDbId,
        catalogGroupId: group.id,
      },
    },
  });

  const mergedRetailers = {
    ...parseRetailerImageUrls(existing?.retailerImageUrlsJson),
    ...(patch.retailerImageUrls ?? {}),
  };

  const candidateUrls = [
    patch.canonicalImageUrl ?? existing?.canonicalImageUrl ?? group.canonicalImageUrl,
    ...Object.values(mergedRetailers),
  ].filter((u): u is string => typeof u === "string" && u.startsWith("http"));
  const bestImage = pickBestImage(candidateUrls);
  const canonicalFromQuality = bestImage?.url;
  const imageQualityJson = bestImage ? imageQualityToJson(bestImage) : "{}";

  const row = await prisma.variantGroup.upsert({
    where: {
      productId_catalogGroupId: {
        productId: productDbId,
        catalogGroupId: group.id,
      },
    },
    create: {
      productId: productDbId,
      catalogGroupId: group.id,
      color: group.color ?? null,
      colorNormalized: group.colorNormalized ?? null,
      styleKey: group.styleKey ?? null,
      canonicalImageUrl:
        canonicalFromQuality ??
        patch.canonicalImageUrl ??
        group.canonicalImageUrl ??
        null,
      retailerImageUrlsJson: serializeRetailerImageUrls(mergedRetailers),
      imageSource: patch.imageSource ?? group.imageSource ?? null,
      imageConfidence:
        bestImage?.imageQualityScore ??
        patch.imageConfidence ??
        group.imageConfidence ??
        null,
      imageQualityJson,
      lastVerifiedAt: patch.touchVerified ? new Date() : null,
      attributesJson: "{}",
    },
    update: {
      color: group.color ?? null,
      colorNormalized: group.colorNormalized ?? null,
      canonicalImageUrl:
        canonicalFromQuality ??
        (patch.canonicalImageUrl !== undefined ?
          patch.canonicalImageUrl
        : existing?.canonicalImageUrl ?? group.canonicalImageUrl ?? null),
      retailerImageUrlsJson: serializeRetailerImageUrls(mergedRetailers),
      imageSource: patch.imageSource ?? existing?.imageSource ?? null,
      imageConfidence:
        bestImage?.imageQualityScore ??
        patch.imageConfidence ??
        existing?.imageConfidence ??
        null,
      imageQualityJson,
      lastVerifiedAt:
        patch.touchVerified ? new Date() : existing?.lastVerifiedAt,
    },
  });

  return {
    id: row.id,
    catalogGroupId: row.catalogGroupId,
    color: row.color,
    colorNormalized: row.colorNormalized,
    canonicalImageUrl: row.canonicalImageUrl,
    retailerImageUrls: parseRetailerImageUrls(row.retailerImageUrlsJson),
    imageSource: row.imageSource,
    imageConfidence: row.imageConfidence,
    lastVerifiedAt: row.lastVerifiedAt,
  };
}

export async function recordRetailerGroupImage(
  productDbId: string,
  group: CatalogVariantGroup,
  retailerId: RetailerId,
  imageUrl: string,
  meta: { imageSource: string; imageConfidence: number },
): Promise<void> {
  const existing = await loadVariantGroup(productDbId, group.id);
  const retailers = mergeRetailerImage(
    existing?.retailerImageUrls ?? {},
    retailerId,
    imageUrl,
    maxRetailerUrlsPerGroup(),
  );
  await upsertVariantGroupImages(productDbId, group, {
    retailerImageUrls: retailers,
    imageSource: meta.imageSource,
    imageConfidence: meta.imageConfidence,
    touchVerified: true,
  });
}

function maxRetailerUrlsPerGroup(): number {
  const raw = process.env.INDEX_IMAGE_MAX_RETAILERS_PER_GROUP?.trim();
  const n = raw ? parseInt(raw, 10) : 3;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 8) : 3;
}
