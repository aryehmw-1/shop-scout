/**
 * Import live PriceQuote rows from the app database into demo catalog format.
 */
import type { DemoProduct } from "../base/types";
import { getDomainForRetailer } from "../utils/retailer-domains";
import { makeProductId } from "../utils/storage";

export async function ingestFromPrisma(): Promise<DemoProduct[]> {
  const { prisma } = await import("../../src/lib/db/prisma");
  const now = new Date();

  const rows = await prisma.priceQuote.findMany({
    where: {
      expiresAt: { gt: now },
      productUrl: { not: "" },
      imageUrl: { not: null },
      priceUsd: { gt: 0 },
    },
    include: { product: true },
    take: 5000,
    orderBy: { fetchedAt: "desc" },
  });

  const products: DemoProduct[] = [];
  for (const row of rows) {
    if (!row.imageUrl || !row.productUrl) continue;
    const retailer = row.retailerId;
    const domain = getDomainForRetailer(retailer) ?? `${retailer}.com`;
    products.push({
      id: makeProductId(retailer, row.productUrl),
      retailer,
      retailer_domain: domain,
      title: row.storeTitle ?? row.product.title,
      brand: row.product.brand,
      category: row.product.category,
      price: row.priceUsd,
      currency: "USD",
      image_url: row.imageUrl,
      product_url: row.productUrl,
      availability: row.inStock ? "in_stock" : "out_of_stock",
      description: null,
      scraped_at: row.fetchedAt.toISOString(),
    });
  }

  return products;
}
