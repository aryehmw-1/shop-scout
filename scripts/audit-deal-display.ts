/**
 * Audit displayed offer quality vs DB stats.
 *
 *   npx tsx scripts/audit-deal-display.ts
 *   npx tsx scripts/audit-deal-display.ts --catalog=jeans-slim
 */
import { prisma } from "../src/lib/db/prisma";
import { CATALOG } from "../src/lib/retailers/catalog";
import { searchService } from "../src/lib/search/search-service";

const catalogFilter = process.argv.find((a) => a.startsWith("--catalog="))?.split("=")[1];

async function main() {
  const items = catalogFilter ?
    CATALOG.filter((c) => c.id === catalogFilter)
  : CATALOG.slice(0, 5);

  console.log("[audit-deal-display] products:", items.map((i) => i.id).join(", "));

  const metrics = await prisma.retailerQualityMetric.findMany({
    orderBy: { trustScore: "desc" },
  });

  console.log("\n--- Retailer reliability ---");
  for (const m of metrics) {
    const fetchRate =
      m.fetchAttempts > 0 ? ((m.fetchSuccesses / m.fetchAttempts) * 100).toFixed(0) : "—";
    const acceptTotal = m.offersAccepted + m.offersRejected;
    const acceptRate =
      acceptTotal > 0 ? ((m.offersAccepted / acceptTotal) * 100).toFixed(0) : "—";
    console.log(
      `${m.retailerId.padEnd(10)} trust=${m.trustScore.toFixed(2)} fetch=${fetchRate}% accept=${acceptRate}% latency=${Math.round(m.avgFetchLatencyMs)}ms`,
    );
  }

  for (const item of items) {
    const intent = {
      query: `${item.brand} ${item.title}`,
      category: item.category as import("../src/lib/types").ProductCategory,
      zipCode: "78701",
    };

    const fast = await searchService.search(intent, { fastOnly: true, skipPersist: true });
    const full = await searchService.enrichSearch(intent, item.id, { skipPersist: true });

    console.log(`\n--- ${item.id} ---`);
    console.log("fast offers:", fast.online.length, "enrichmentPending:", fast.enrichmentPending);
    console.log("full offers:", full.online.length);

    const best = full.online.find((o) => o.isBestDeal) ?? full.online[0];
    if (best) {
      console.log("best deal:", {
        retailer: best.retailer,
        price: best.price,
        dealScore: best.dealScore,
        pctBelowMarket: best.percentBelowMarket,
        why: best.dealExplanation?.bullets?.slice(0, 3),
      });
    }

    const stats = await prisma.productRetailerPriceStats.findMany({
      where: { product: { catalogId: item.id } },
      select: {
        retailerId: true,
        verificationCount: true,
        lowestPriceUsd: true,
        movingAvgPriceUsd: true,
        lastVerifiedAt: true,
      },
    });
    if (stats.length) {
      console.log("price stats:", stats.slice(0, 5));
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
