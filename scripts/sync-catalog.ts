/**
 * Mirror in-code CATALOG → Product, VariantGroup, ProductVariant.
 * Use this instead of backfill-variant-groups on a fresh DB.
 *
 *   npx tsx scripts/sync-catalog.ts
 */
import { ensureCatalogSynced } from "../src/lib/db/catalog-sync";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const before = {
    products: await prisma.product.count(),
    variantGroups: await prisma.variantGroup.count(),
    variants: await prisma.productVariant.count(),
  };

  await ensureCatalogSynced();

  const after = {
    products: await prisma.product.count(),
    variantGroups: await prisma.variantGroup.count(),
    variants: await prisma.productVariant.count(),
  };

  console.log("[sync-catalog] done", { before, after });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
