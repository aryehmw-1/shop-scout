#!/usr/bin/env node
/**
 * Remove catalog estimates and legacy index rows so search only uses scraped/API quotes.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STALE_SOURCES = [
  "catalog_estimate",
  "catalog_model",
  "daily_index",
  "nightly_index",
  "cached_quote",
];

async function main() {
  const result = await prisma.priceQuote.deleteMany({
    where: { source: { in: STALE_SOURCES } },
  });
  console.log(
    `Purged ${result.count} PriceQuote rows with sources: ${STALE_SOURCES.join(", ")}`,
  );
  console.log(
    "Re-run with INDEX_FETCH_RETAILER_IMAGES=true npm run index:full:local to rebuild scraped rows.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
