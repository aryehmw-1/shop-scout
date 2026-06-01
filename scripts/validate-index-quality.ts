/**
 * Validate indexing quality after a nightly run.
 *
 *   npm run validate:index-quality
 *   npm run validate:index-quality -- --min-offers=5 --min-retailers=2
 */
import { prisma } from "../src/lib/db/prisma";
import { loadLastIndexRunArtifact } from "../src/lib/indexing/index-run-artifact";
import { collectPlatformHealth } from "../src/lib/ops/data-observability";
import { isAmazonPaapiConfigured } from "../src/lib/search/providers/amazon-paapi-config";
import { consumerVisibleQuoteCutoff } from "../src/lib/pricing/quote-freshness-policy";

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit?.split("=")[1];
}

async function main() {
  const minOffers = parseInt(argValue("--min-offers") ?? "1", 10);
  const minRetailers = parseInt(argValue("--min-retailers") ?? "2", 10);
  const minPersistRate = parseFloat(argValue("--min-persist-rate") ?? "0.05");

  const [health, lastRun, products, visibleQuotes, retailerCoverage] = await Promise.all([
    collectPlatformHealth(),
    loadLastIndexRunArtifact(),
    prisma.product.count(),
    prisma.priceQuote.count({
      where: { fetchedAt: { gte: consumerVisibleQuoteCutoff() } },
    }),
    prisma.priceQuote.groupBy({
      by: ["retailerId"],
      where: { fetchedAt: { gte: consumerVisibleQuoteCutoff() } },
      _count: { _all: true },
    }),
  ]);

  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  checks.push({
    name: "catalog_loaded",
    ok: products >= 70 && products <= 85,
    detail: `${products} products (expected ~78 seeded, no aggressive expansion)`,
  });

  checks.push({
    name: "verified_offers_visible",
    ok: visibleQuotes >= minOffers,
    detail: `${visibleQuotes} consumer-visible quotes (min ${minOffers})`,
  });

  checks.push({
    name: "retailer_diversity",
    ok: retailerCoverage.length >= minRetailers,
    detail: `${retailerCoverage.length} retailers with visible quotes (min ${minRetailers})`,
  });

  checks.push({
    name: "amazon_paapi_configured",
    ok: isAmazonPaapiConfigured(),
    detail: isAmazonPaapiConfigured() ?
      "PA-API credentials present"
    : "MISSING — set AMAZON_PA_API_* for primary Amazon ingestion",
  });

  if (lastRun) {
    checks.push({
      name: "last_run_wrote_offers",
      ok: lastRun.report.offersWritten >= minOffers,
      detail: `Last run: ${lastRun.report.offersWritten} offers / ${lastRun.report.productsIndexed} products`,
    });
    checks.push({
      name: "verified_persistence_rate",
      ok: lastRun.retailerSummary.rates.verifiedPersistenceRate >= minPersistRate,
      detail: `${(lastRun.retailerSummary.rates.verifiedPersistenceRate * 100).toFixed(1)}% verified persist rate (min ${(minPersistRate * 100).toFixed(0)}%)`,
    });
    checks.push({
      name: "stale_fallback",
      ok:
        lastRun.report.offersWritten === 0 ?
          visibleQuotes > 0
        : true,
      detail:
        lastRun.report.offersWritten === 0 ?
          visibleQuotes > 0 ?
            "Zero new offers but stale quotes remain visible"
          : "Zero new offers AND no visible stale quotes"
        : "New offers written — stale fallback not required",
    });
  } else {
    checks.push({
      name: "index_run_artifact",
      ok: false,
      detail: "No artifacts/ops/index-run-latest.json — run npm run index:daily:local -- --limit=3",
    });
  }

  const failed = checks.filter((c) => !c.ok);

  console.log("\n=== Index Quality Validation ===\n");
  for (const c of checks) {
    console.log(`${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`);
  }

  if (health.acquisition) {
    console.log("\n--- Last run acquisition metrics ---");
    console.log(`Fetch success: ${(health.acquisition.fetchSuccessRate * 100).toFixed(1)}%`);
    console.log(`Parse success: ${(health.acquisition.parseSuccessRate * 100).toFixed(1)}%`);
    console.log(`Verified persist: ${(health.acquisition.verifiedPersistenceRate * 100).toFixed(1)}%`);
    console.log(`Trust rejection: ${(health.acquisition.trustRejectionRate * 100).toFixed(1)}%`);
    if (Object.keys(health.acquisition.persistRejectionsByReason).length) {
      console.log("Top persist rejections:", health.acquisition.persistRejectionsByReason);
    }
  }

  console.log(`\nResult: ${failed.length === 0 ? "PASS" : `FAIL (${failed.length} checks)`}\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
