import { parseRetailerImageUrls } from "./variant-group-images";
import type { CatalogVariantGroup } from "./variant-groups";
import { prisma } from "../db/prisma";

/** Load indexed variant-group images from DB for search/display. */
export async function loadVariantGroupsForCatalog(
  catalogId: string,
): Promise<CatalogVariantGroup[]> {
  const product = await prisma.product.findUnique({
    where: { catalogId },
    include: {
      variantGroups: {
        include: { sizes: true },
      },
    },
  });
  if (!product) return [];

  return product.variantGroups.map((g) => ({
    id: g.catalogGroupId,
    color: g.color ?? undefined,
    colorNormalized: g.colorNormalized ?? undefined,
    styleKey: g.styleKey ?? undefined,
    canonicalImageUrl: g.canonicalImageUrl ?? undefined,
    retailerImageUrls: parseRetailerImageUrls(g.retailerImageUrlsJson),
    imageSource: g.imageSource ?? undefined,
    imageConfidence: g.imageConfidence ?? undefined,
    sizes: g.sizes.map((s) => ({
      id: s.catalogVariantId,
      sizeLabel: s.sizeLabel,
      sizeNormalized: s.sizeNormalized,
      sizeKind: s.sizeKind as CatalogVariantGroup["sizes"][0]["sizeKind"],
      gtin: s.gtin ?? undefined,
      sizeSpecificImageUrl: s.sizeSpecificImageUrl ?? undefined,
      basePrice: s.basePriceUsd ?? undefined,
      isDefault: s.isDefault,
    })),
  }));
}
