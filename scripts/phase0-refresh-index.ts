#!/usr/bin/env tsx
/**
 * Phase 0 — refresh flagship verified inventory for production-usable products.
 *
 *   npm run phase0:refresh
 *   npm run phase0:refresh -- --limit=22
 */
import { prisma } from "../src/lib/db/prisma";
import { runNightlyPriceIndex } from "../src/lib/indexing/nightly-quotes";
import { getFullIndexRotationPlan } from "../src/lib/indexing/weekly-retailer-schedule";
import { getFlagshipCatalogIds } from "../src/lib/inventory/flagship-catalog";

const VERIFIED = ["scraped", "connector_api", "daily_index", "nightly_index"];
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : 22;

async function main() {
  const now = new Date();
  const flagshipIds = getFlagshipCatalogIds();

  const products = await prisma.product.findMany({
    where: { catalogId: { in: flagshipIds } },
    select: {
      catalogId: true,
      title: true,
      priceQuotes: {
        where: { source: { in: VERIFIED } },
        select: { expiresAt: true, fetchedAt: true, retailerId: true },
      },
    },
  });

  const staleCandidates = products
    .map((p) => {
      const active = p.priceQuotes.filter((q) => q.expiresAt > now);
      const expired = p.priceQuotes.filter((q) => q.expiresAt <= now);
      const retailers = new Set(active.map((q) => q.retailerId));
      return {
        catalogId: p.catalogId,
        title: p.title,
        activeCount: active.length,
        expiredCount: expired.length,
        retailerDiversity: retailers.size,
        needsRefresh: active.length === 0 || retailers.size < 2,
        priority:
          (active.length === 0 ? 20 : 0) +
          expired.length * 3 +
          (retailers.size < 2 ? 8 : 0),
      };
    })
    .filter((p) => p.needsRefresh)
    .sort((a, b) => b.priority - a.priority);

  const catalogIds: string[] = [];
  for (const c of staleCandidates) {
    if (!catalogIds.includes(c.catalogId)) catalogIds.push(c.catalogId);
  }
  for (const id of flagshipIds) {
    if (catalogIds.length >= limit) break;
    if (!catalogIds.includes(id)) catalogIds.push(id);
  }

  const toIndex = catalogIds.slice(0, limit);

  console.log(`[phase0:refresh] re-indexing ${toIndex.length} flagship products`);
  for (const id of toIndex) {
    const c = staleCandidates.find((s) => s.catalogId === id);
    console.log(
      `  · ${id}${c ? ` (expired=${c.expiredCount}, active=${c.activeCount}, retailers=${c.retailerDiversity})` : " (fresh index)"}`,
    );
  }

  if (!toIndex.length) {
    console.log("[phase0:refresh] no flagship products to index");
    process.exit(0);
  }

  const report = await runNightlyPriceIndex({
    catalogIds: toIndex,
    flagshipOnly: true,
    delayMs: 500,
    rotationPlan: getFullIndexRotationPlan(),
  });

  console.log("[phase0:refresh] done", JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("[phase0:refresh] failed", e);
  process.exit(1);
});
