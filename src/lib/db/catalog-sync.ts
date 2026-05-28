import { CATALOG } from "../retailers/catalog";
import { prisma } from "./prisma";

let syncPromise: Promise<void> | null = null;

/** Idempotent: mirror in-memory catalog into Product + ProductAlias tables. */
export async function ensureCatalogSynced(): Promise<void> {
  if (!syncPromise) {
    syncPromise = syncCatalog();
  }
  return syncPromise;
}

async function syncCatalog(): Promise<void> {
  const count = await prisma.product.count();
  if (count >= CATALOG.length) return;

  for (const item of CATALOG) {
    const product = await prisma.product.upsert({
      where: { catalogId: item.id },
      create: {
        catalogId: item.id,
        slug: item.slug,
        title: item.title,
        brand: item.brand,
        upc: item.upc,
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
        basePriceUsd: item.basePrice,
        imageUrl: item.imageUrl || null,
        keywordsJson: JSON.stringify(item.keywords),
      },
    });

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
  }
}
