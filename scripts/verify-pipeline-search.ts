import { compareProduct } from "../src/lib/retailers/catalog";
import { enrichOffersAtSearch } from "../src/lib/offers/enrich-offers-at-search";
import { prepareResultsForDisplay } from "../src/lib/offers/offer-ranking";
import { finalizeSearchPrices } from "../src/lib/search/price-truth";
import { isVerifiedOffer } from "../src/lib/offers/offer-trust";
import { prisma } from "../src/lib/db/prisma";
import type { CatalogItem } from "../src/lib/retailers/catalog";

const catalogId =
  process.argv.find((a) => a.startsWith("--catalog-id="))?.split("=")[1] ?? "jeans-slim";

async function main() {
  const intent = {
    query: "jeans slim",
    category: "clothing" as const,
    zipCode: "78701",
  };

  const row = await prisma.product.findUnique({
    where: { catalogId },
    select: {
      catalogId: true,
      title: true,
      brand: true,
      category: true,
      basePriceUsd: true,
    },
  });
  if (!row) {
    console.error("Product not in DB — run npm run bootstrap:db");
    process.exit(1);
  }

  const item: CatalogItem = {
    id: row.catalogId,
    title: row.title,
    brand: row.brand ?? "",
    size: "",
    upc: "",
    imageUrl: "",
    category: row.category ?? "clothing",
    keywords: ["jeans", "slim"],
    organic: false,
    basePrice: row.basePriceUsd ?? 40,
    unitLabel: "each",
    slug: row.catalogId,
  };

  let results = compareProduct(item, intent);
  console.log("[verify] offers before enrich:", results.online.length);

  results = await enrichOffersAtSearch(results, item, intent);
  results = finalizeSearchPrices(results);
  results = prepareResultsForDisplay(results, { item, intent });

  console.log(
    "[verify] verified:",
    results.online.length,
    "estimated:",
    results.estimatedOnline?.length ?? 0,
  );

  for (const o of results.online.slice(0, 5)) {
    console.log({
      retailer: o.retailer,
      verified: isVerifiedOffer(o),
      price: o.price,
      source: o.priceSource,
      image: o.imageUrl?.slice(0, 60),
      url: o.productUrl?.slice(0, 70),
      fallback: o.pipelineDebug?.imageFallbackLevel,
    });
  }

  console.log("\n[verify] Re-run — stable retailers should match unless PDP changed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
