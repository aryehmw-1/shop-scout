#!/usr/bin/env node
/**
 * Backfill brand canonical names, product identifiers, and brand table.
 * Run: npm run db:push && node scripts/backfill-identity.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BRAND_ALIASES = {
  levis: "Levi's",
  "levi strauss": "Levi's",
  "levi's": "Levi's",
};

function canonicalizeBrand(raw) {
  if (!raw?.trim()) return null;
  const key = raw.trim().toLowerCase().replace(/[''`]/g, "");
  if (BRAND_ALIASES[key]) return BRAND_ALIASES[key];
  return raw.trim();
}

async function main() {
  const products = await prisma.product.findMany();
  let brands = 0;
  let ids = 0;

  for (const p of products) {
    const brandCanonical = canonicalizeBrand(p.brand);
    await prisma.product.update({
      where: { id: p.id },
      data: {
        brandCanonical,
        brandRaw: p.brand,
        refreshPriority: p.refreshPriority || 50,
      },
    });
    if (brandCanonical) {
      await prisma.brandCanonical.upsert({
        where: { canonical: brandCanonical },
        create: { canonical: brandCanonical, aliasesJson: "[]" },
        update: {},
      });
      brands += 1;
    }

    const upc = p.upc?.replace(/\D/g, "");
    if (upc && upc.length >= 8) {
      await prisma.productIdentifier.upsert({
        where: { type_value: { type: "upc", value: upc } },
        create: {
          productId: p.id,
          type: "upc",
          value: upc,
          source: "backfill",
          confidence: 1,
        },
        update: { productId: p.id },
      });
      ids += 1;
    }
  }

  console.log(
    JSON.stringify({
      ok: true,
      products: products.length,
      brandCanonicalRows: brands,
      identifiersUpserted: ids,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
