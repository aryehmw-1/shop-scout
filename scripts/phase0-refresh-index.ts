#!/usr/bin/env node --import tsx/esm
/**
 * Phase 0 — refresh expired verified inventory for production-usable candidates.
 *
 *   npm run phase0:refresh
 *   npm run phase0:refresh -- --limit=15
 */
import { prisma } from "../src/lib/db/prisma";
import { runNightlyPriceIndex } from "../src/lib/indexing/nightly-quotes";
import { getFullIndexRotationPlan } from "../src/lib/indexing/weekly-retailer-schedule";

const VERIFIED = ["scraped", "connector_api", "daily_index", "nightly_index"];
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : 15;

async function main() {
  const now = new Date();

  const products = await prisma.product.findMany({
    select: {
      catalogId: true,
      title: true,
      priceQuotes: {
        where: { source: { in: VERIFIED } },
        select: { expiresAt: true, fetchedAt: true, retailerId: true },
      },
    },
  });

  const candidates = products
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
        needsRefresh: active.length === 0 && expired.length > 0,
        priority: expired.length * 2 + (active.length === 0 ? 10 : 0) + retailers.size,
      };
    })
    .filter((p) => p.needsRefresh || p.activeCount < 2)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);

  console.log(`[phase0:refresh] re-indexing ${candidates.length} priority products`);
  for (const c of candidates) {
    console.log(`  · ${c.catalogId} (expired=${c.expiredCount}, active=${c.activeCount})`);
  }

  if (!candidates.length) {
    console.log("[phase0:refresh] no candidates — run full index or expand catalog");
    process.exit(0);
  }

  const report = await runNightlyPriceIndex({
    limit: candidates.length,
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
