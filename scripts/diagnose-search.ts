#!/usr/bin/env tsx
/**
 * Diagnostic: where do offers drop to zero for a live search? Runs the real
 * inventory-service search against the prod DB and reports counts at each stage
 * + freshness tiers, so we can see whether stale data is being hidden.
 *
 *   npx tsx --conditions=react-server scripts/diagnose-search.ts "paper towels"
 */
import { loadEnv } from "./load-env.mjs";
loadEnv();

import { prisma } from "../src/lib/db/prisma";
import { searchProducts } from "../src/lib/inventory/inventory-service";
import { classifyOfferFreshness } from "../src/lib/pricing/quote-freshness-policy";

async function main() {
  const queries = process.argv.slice(2);
  if (!queries.length) queries.push("paper towels", "dish soap", "trash bags", "laundry detergent", "toilet paper");

  // Raw DB snapshot first.
  const now = new Date();
  const totalQuotes = await prisma.priceQuote.count();
  const freshQuotes = await prisma.priceQuote.count({ where: { expiresAt: { gt: now } } });
  const publishedProducts = await prisma.product.count({ where: { published: true, validationStatus: "approved" } });
  console.log("=== PROD DB snapshot ===");
  console.log({ totalQuotes, freshQuotes, expiredQuotes: totalQuotes - freshQuotes, publishedProducts });

  for (const q of queries) {
    console.log(`\n=== query: "${q}" ===`);
    const freshRes = await searchProducts(q, { freshOnly: true, limit: 5 });
    const staleRes = await searchProducts(q, { freshOnly: false, limit: 5 });
    const tiers = (res: Awaited<ReturnType<typeof searchProducts>>) =>
      (res?.online ?? []).map((o) => ({
        retailer: o.retailer,
        price: o.price,
        tier: classifyOfferFreshness(o).tier,
        ageLabel: classifyOfferFreshness(o).displayLabel,
        title: (o.storeTitle ?? o.title ?? "").slice(0, 40),
      }));
    console.log("  freshOnly:true  → online:", freshRes?.online.length ?? 0, " similar:", freshRes?.similar?.length ?? 0);
    console.table(tiers(freshRes));
    console.log("  freshOnly:false → online:", staleRes?.online.length ?? 0, " similar:", staleRes?.similar?.length ?? 0);
    console.table(tiers(staleRes));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
