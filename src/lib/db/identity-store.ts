import { canonicalizeBrand } from "../identity/normalize-brand";
import {
  identifiersFromRecord,
  normalizeIdentifier,
} from "../identity/product-identifiers";
import type { ProductIdentifiers } from "../identity/types";
import { prisma } from "./prisma";

export async function upsertProductIdentifiers(
  productId: string,
  ids: ProductIdentifiers,
  source: string,
  links?: { variantGroupId?: string; variantId?: string },
): Promise<void> {
  const entries: Array<{ type: string; value: string }> = [];
  const push = (type: keyof ProductIdentifiers, value?: string) => {
    if (value) entries.push({ type, value });
  };
  push("upc", ids.upc);
  push("gtin", ids.gtin);
  push("ean", ids.ean);
  push("mpn", ids.mpn);
  push("manufacturerPartNumber", ids.manufacturerPartNumber);
  push("asin", ids.asin);
  push("sku", ids.sku);

  for (const { type, value } of entries) {
    await prisma.productIdentifier.upsert({
      where: { type_value: { type, value } },
      create: {
        productId,
        variantGroupId: links?.variantGroupId ?? null,
        variantId: links?.variantId ?? null,
        type,
        value,
        source,
        confidence: 1,
      },
      update: {
        productId,
        variantGroupId: links?.variantGroupId ?? undefined,
        variantId: links?.variantId ?? undefined,
        source,
      },
    });
  }
}

export async function findProductIdByIdentifier(
  type: string,
  raw: string,
): Promise<string | null> {
  const value = normalizeIdentifier(type as "upc", raw);
  if (!value) return null;
  const row = await prisma.productIdentifier.findUnique({
    where: { type_value: { type, value } },
    select: { productId: true },
  });
  return row?.productId ?? null;
}

export async function upsertRetailerProductIdentity(input: {
  retailerId: string;
  storeTitle: string;
  productUrl: string;
  retailerBrandRaw?: string;
  externalSku?: string;
  identifiers?: ProductIdentifiers;
  productId?: string;
  variantGroupId?: string;
  variantId?: string;
  rawAttributesJson?: string;
}): Promise<string> {
  const ids = identifiersFromRecord(input.identifiers ?? {});
  const row = await prisma.retailerProductIdentity.upsert({
    where: {
      retailerId_productUrl: {
        retailerId: input.retailerId,
        productUrl: input.productUrl,
      },
    },
    create: {
      retailerId: input.retailerId,
      storeTitle: input.storeTitle,
      productUrl: input.productUrl,
      retailerBrandRaw: input.retailerBrandRaw ?? null,
      externalSku: input.externalSku ?? null,
      upc: ids.upc ?? null,
      gtin: ids.gtin ?? ids.ean ?? null,
      mpn: ids.mpn ?? null,
      manufacturerPartNumber: ids.manufacturerPartNumber ?? null,
      productId: input.productId ?? null,
      variantGroupId: input.variantGroupId ?? null,
      variantId: input.variantId ?? null,
      rawAttributesJson: input.rawAttributesJson ?? "{}",
      lastSeenAt: new Date(),
    },
    update: {
      storeTitle: input.storeTitle,
      retailerBrandRaw: input.retailerBrandRaw ?? undefined,
      upc: ids.upc ?? undefined,
      gtin: ids.gtin ?? ids.ean ?? undefined,
      mpn: ids.mpn ?? undefined,
      manufacturerPartNumber: ids.manufacturerPartNumber ?? undefined,
      productId: input.productId ?? undefined,
      variantGroupId: input.variantGroupId ?? undefined,
      variantId: input.variantId ?? undefined,
      rawAttributesJson: input.rawAttributesJson ?? undefined,
      lastSeenAt: new Date(),
    },
  });
  return row.id;
}

export async function syncBrandCanonicalTable(): Promise<number> {
  const products = await prisma.product.findMany({
    select: { brand: true, brandCanonical: true },
  });
  const seen = new Set<string>();
  let count = 0;
  for (const p of products) {
    const canonical = p.brandCanonical ?? canonicalizeBrand(p.brand);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    await prisma.brandCanonical.upsert({
      where: { canonical },
      create: { canonical, aliasesJson: "[]" },
      update: {},
    });
    count += 1;
  }
  return count;
}

export async function bumpProductSearchFrequency(catalogId: string): Promise<void> {
  await prisma.product.updateMany({
    where: { catalogId },
    data: { searchFrequency: { increment: 1 } },
  });
}
