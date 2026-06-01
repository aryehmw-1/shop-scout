#!/usr/bin/env node
/**
 * Remove catalog estimates and legacy index rows so search only uses scraped/API quotes.
 *
 * Safety: requires --confirm; use --dry-run to preview. Blocked in production unless
 * ALLOW_DESTRUCTIVE_DB_OPS=1.
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

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const confirm = args.has("--confirm");

function assertSafeToPurge() {
  const isProduction = process.env.NODE_ENV === "production";
  const force = process.env.ALLOW_DESTRUCTIVE_DB_OPS === "1";
  if (dryRun) return;
  if (isProduction && !force && !confirm) {
    throw new Error(
      "Blocked in production. Pass --confirm and set ALLOW_DESTRUCTIVE_DB_OPS=1 if intentional.",
    );
  }
  if (!confirm && !force) {
    throw new Error("Requires --confirm. Use --dry-run to preview row count first.");
  }
}

async function main() {
  const preview = await prisma.priceQuote.count({
    where: { source: { in: STALE_SOURCES } },
  });

  console.log(`[purge-estimate-quotes] matching rows: ${preview}`);
  console.log(`  sources: ${STALE_SOURCES.join(", ")}`);
  console.log(`  dryRun=${dryRun} confirm=${confirm}`);

  if (dryRun) {
    console.log("Dry run — no rows deleted.");
    return;
  }

  assertSafeToPurge();

  const result = await prisma.priceQuote.deleteMany({
    where: { source: { in: STALE_SOURCES } },
  });
  console.log(`Purged ${result.count} PriceQuote rows.`);
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
