import { getVariantGroupsForItem } from "../catalog/variant-groups";
import { canonicalizeBrand } from "../identity/normalize-brand";
import { identifiersFromRecord } from "../identity/product-identifiers";
import { indexLog, indexLogAlways } from "../indexing/index-progress";
import { CATALOG } from "../retailers/catalog";
import { upsertProductIdentifiers } from "./identity-store";
import { prisma } from "./prisma";

let syncPromise: Promise<void> | null = null;

/** Idempotent: mirror catalog → Product, VariantGroup, ProductVariant, aliases. */
export async function ensureCatalogSynced(): Promise<void> {
  if (!syncPromise) {
    syncPromise = syncCatalog();
  }
  return syncPromise;
}

async function syncCatalog(): Promise<void> {
  const started = Date.now();
  indexLogAlways("catalog-sync: begin", { products: CATALOG.length });
  let i = 0;
  for (const item of CATALOG) {
    i += 1;
    indexLog("catalog-sync: product", {
      n: i,
      total: CATALOG.length,
      catalogId: item.id,
    });
    const brandCanonical = canonicalizeBrand(item.brand);
    const productIds = identifiersFromRecord({
      upc: item.upc,
      gtin: item.upc,
    });

    const product = await prisma.product.upsert({
      where: { catalogId: item.id },
      create: {
        catalogId: item.id,
        slug: item.slug,
        title: item.title,
        brand: item.brand,
        brandCanonical: brandCanonical ?? null,
        brandRaw: item.brand,
        upc: productIds.upc ?? item.upc,
        gtin: productIds.gtin ?? null,
        category: item.category,
        sizeLabel: item.size,
        basePriceUsd: item.basePrice,
        unitLabel: item.unitLabel,
        imageUrl: item.imageUrl || null,
        keywordsJson: JSON.stringify(item.keywords),
        organic: item.organic,
      },
      update: {
        title: item.title,
        brand: item.brand,
        brandCanonical: brandCanonical ?? null,
        brandRaw: item.brand,
        upc: productIds.upc ?? item.upc,
        gtin: productIds.gtin ?? undefined,
        basePriceUsd: item.basePrice,
        imageUrl: item.imageUrl || null,
        keywordsJson: JSON.stringify(item.keywords),
      },
    });

    await upsertProductIdentifiers(product.id, productIds, "catalog");

    for (const kw of item.keywords) {
      await prisma.productAlias.upsert({
        where: {
          productId_alias: { productId: product.id, alias: kw.toLowerCase() },
        },
        create: {
          productId: product.id,
          alias: kw.toLowerCase(),
          source: "keyword",
        },
        update: {},
      });
    }

    const groups = getVariantGroupsForItem(item);
    for (const group of groups) {
      const variantGroup = await prisma.variantGroup.upsert({
        where: {
          productId_catalogGroupId: {
            productId: product.id,
            catalogGroupId: group.id,
          },
        },
        create: {
          productId: product.id,
          catalogGroupId: group.id,
          color: group.color ?? null,
          colorNormalized: group.colorNormalized ?? null,
          styleKey: group.styleKey ?? null,
          canonicalImageUrl: group.canonicalImageUrl ?? null,
          retailerImageUrlsJson: JSON.stringify(group.retailerImageUrls ?? {}),
          imageSource: group.imageSource ?? null,
          imageConfidence: group.imageConfidence ?? null,
          attributesJson: "{}",
        },
        update: {
          color: group.color ?? null,
          colorNormalized: group.colorNormalized ?? null,
          styleKey: group.styleKey ?? null,
          canonicalImageUrl: group.canonicalImageUrl ?? undefined,
        },
      });

      for (const size of group.sizes) {
        await prisma.productVariant.upsert({
          where: {
            productId_catalogVariantId: {
              productId: product.id,
              catalogVariantId: size.id,
            },
          },
          create: {
            productId: product.id,
            variantGroupId: variantGroup.id,
            catalogVariantId: size.id,
            sizeLabel: size.sizeLabel,
            sizeNormalized: size.sizeNormalized,
            sizeKind: size.sizeKind,
            gtin: size.gtin ?? null,
            upc: size.gtin ?? null,
            sizeSpecificImageUrl: size.sizeSpecificImageUrl ?? null,
            keywordsJson: JSON.stringify(group.keywords ?? []),
            basePriceUsd: size.basePrice ?? null,
            isDefault: size.isDefault ?? false,
          },
          update: {
            variantGroupId: variantGroup.id,
            sizeLabel: size.sizeLabel,
            sizeNormalized: size.sizeNormalized,
            sizeKind: size.sizeKind,
            gtin: size.gtin ?? null,
            upc: size.gtin ?? null,
            sizeSpecificImageUrl: size.sizeSpecificImageUrl ?? null,
            basePriceUsd: size.basePrice ?? null,
            isDefault: size.isDefault ?? false,
          },
        });
      }
    }
  }
  indexLogAlways("catalog-sync: done", {
    products: CATALOG.length,
    elapsed: `${Math.round((Date.now() - started) / 1000)}s`,
  });
}
