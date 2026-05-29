#!/usr/bin/env node
/**
 * Remove bad scraped PriceQuote rows (wrong units, search-page garbage, off-category).
 *
 *   npm run db:purge-absurd-scraped              # delete
 *   npm run db:purge-absurd-scraped -- --dry-run # preview only
 *
 * Rules (source = scraped only):
 *   - priceUsd > MAX_ABSOLUTE_USD (default 500)
 *   - priceUsd < MIN_USD (default 0.25)
 *   - basePrice set: priceUsd > base * MAX_RATIO or < base * MIN_RATIO
 *   - grocery product + priceUsd > GROCERY_CEILING (default 80)
 *   - apparel/shoes + priceUsd > APPAREL_CEILING (default 350)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

const MAX_ABSOLUTE_USD = Number(process.env.PURGE_MAX_USD ?? 500);
const MIN_USD = Number(process.env.PURGE_MIN_USD ?? 0.25);
const MAX_RATIO = Number(process.env.PURGE_MAX_CATALOG_RATIO ?? 3);
const MIN_RATIO = Number(process.env.PURGE_MIN_CATALOG_RATIO ?? 0.2);
const GROCERY_CEILING = Number(process.env.PURGE_GROCERY_CEILING ?? 80);
const APPAREL_CEILING = Number(process.env.PURGE_APPAREL_CEILING ?? 350);

const GROCERY_CATEGORIES = new Set([
  "salad",
  "dairy",
  "bakery",
  "produce",
  "meat",
  "pantry",
  "household",
]);

const APPAREL_CATEGORIES = new Set(["clothing", "shoes"]);

function absurdReason(priceUsd, basePrice, category) {
  if (priceUsd > MAX_ABSOLUTE_USD) {
    return `above max $${MAX_ABSOLUTE_USD}`;
  }
  if (priceUsd < MIN_USD) {
    return `below min $${MIN_USD}`;
  }
  if (GROCERY_CATEGORIES.has(category) && priceUsd > GROCERY_CEILING) {
    return `grocery ceiling $${GROCERY_CEILING}`;
  }
  if (APPAREL_CATEGORIES.has(category) && priceUsd > APPAREL_CEILING) {
    return `apparel ceiling $${APPAREL_CEILING}`;
  }
  if (basePrice && basePrice > 0) {
    const ratio = priceUsd / basePrice;
    if (ratio > MAX_RATIO) return `${ratio.toFixed(1)}x catalog base`;
    if (ratio < MIN_RATIO) return `${ratio.toFixed(2)}x catalog base (low)`;
  }
  return null;
}

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, catalogId: true, category: true, basePriceUsd: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const quotes = await prisma.priceQuote.findMany({
    where: { source: "scraped" },
    select: {
      id: true,
      productId: true,
      retailerId: true,
      priceUsd: true,
      storeTitle: true,
      productUrl: true,
    },
  });

  const toDelete = [];
  const byReason = new Map();

  for (const q of quotes) {
    const product = byId.get(q.productId);
    const category = product?.category ?? "unknown";
    const base = product?.basePriceUsd ?? null;
    const reason = absurdReason(q.priceUsd, base, category);
    if (!reason) continue;
    toDelete.push(q);
    const key = reason.split(" ")[0];
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }

  console.log(`Scanned ${quotes.length} scraped quotes, ${toDelete.length} absurd matches`);
  if (byReason.size) {
    console.log("By rule:", Object.fromEntries(byReason));
  }

  const sample = toDelete.slice(0, 15);
  for (const q of sample) {
    const p = byId.get(q.productId);
    console.log(
      `  ${p?.catalogId ?? q.productId} @ ${q.retailerId}: $${q.priceUsd} — ${q.storeTitle?.slice(0, 40) ?? ""}`,
    );
  }
  if (toDelete.length > 15) {
    console.log(`  … and ${toDelete.length - 15} more`);
  }

  if (dryRun) {
    console.log("\nDry run — no rows deleted. Re-run without --dry-run to purge.");
    return;
  }

  if (!toDelete.length) {
    console.log("Nothing to purge.");
    return;
  }

  const result = await prisma.priceQuote.deleteMany({
    where: { id: { in: toDelete.map((q) => q.id) } },
  });
  console.log(`\nDeleted ${result.count} absurd scraped PriceQuote rows.`);
  console.log("Next: npm run db:purge-estimates  # optional, clears estimates too");
  console.log(
    "Then: SKIP_CATALOG_SYNC=1 INDEX_FETCH_RETAILER_IMAGES=true npm run index:full:local -- --limit=3",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
