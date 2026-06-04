#!/usr/bin/env tsx
/**
 * Demo commerce ingestion CLI (local only — not for Vercel serverless).
 *
 * Examples:
 *   npm run demo:ingest
 *   npm run demo:ingest -- --retailers=target,walmart,amazon --max-per-retailer=80
 *   npm run demo:ingest -- --all-retailers --max-per-retailer=10
 *   npm run demo:seed
 *   npm run demo:validate
 */
import { runIngest } from "./pipeline/ingest";
import { runBulkIngest } from "./pipeline/bulk-ingest";
import { listUniqueRetailers } from "./utils/retailer-domains";
import { loadProducts, saveProducts } from "./utils/storage";
import { DEFAULT_USER_AGENT } from "./config";
import type { DemoProduct } from "./base/types";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function cmdEvalIntelligence() {
  const { runFullIntelligenceEvalAndSave } = await import(
    "../src/lib/commerce-intelligence/eval/run-full-eval"
  );
  const report = runFullIntelligenceEvalAndSave();
  console.log("\n=== Intelligence evaluation (metrics) ===");
  console.log(JSON.stringify(report.metrics, null, 2));
  console.log("\n=== Calibration ===");
  console.log(
    `Score: ${report.calibration.calibrationScore} · FP signals: ${report.calibration.falsePositiveSignals.length}`,
  );
  console.log("\n=== Golden suite ===");
  console.log(
    `Pass ${report.golden.passed}/${report.golden.total} (${Math.round(report.golden.passRate * 100)}%)`,
  );
  if (report.golden.failed > 0) {
    for (const c of report.golden.cases.filter((x) => !x.passed)) {
      console.log(`  ✗ ${c.id}: ${c.failures.join("; ")}`);
    }
  }
  console.log("\n=== Drift ===");
  console.log(
    `Mean volatility ${report.drift.meanVolatility} · unstable: ${report.drift.unstableRegions.length}`,
  );
  console.log("\n=== Adversarial ===");
  console.log(
    `Pass ${report.adversarial.passed}/${report.adversarial.total}`,
  );
  for (const c of report.adversarial.cases.filter((x) => !x.passed)) {
    console.log(`  ✗ ${c.id}: ${c.detail}`);
  }
  console.log("\n=== Recommendation quality ===");
  console.log(
    `Overall ${report.recommendationQuality.overallScore} · satisfaction proxy ${report.recommendationQuality.satisfactionProxy}`,
  );
  console.log("\n=== Ingest stress ===");
  console.log(`Pass ${report.ingestStress.passed}/${report.ingestStress.total}`);
  console.log("\n=== Usefulness (analytics) ===");
  for (const line of report.usefulness.insights) {
    console.log(`  · ${line}`);
  }
  console.log("\n=== Regression gates ===");
  for (const g of report.regressionGates.gates) {
    console.log(`  ${g.passed ? "✓" : "✗"} ${g.id}: ${g.detail}`);
  }
  if (!report.regressionGates.passed) {
    process.exitCode = 1;
  }
  console.log("\nWrote data/intelligence-graph/*-report.json");
}

async function cmdImpactIngest() {
  const { runImpactIngest } = await import(
    "../src/lib/commerce-intelligence/ingest/impact/pipeline"
  );
  const file = arg("file");
  const result = await runImpactIngest({
    filePath: file,
    useApi: hasFlag("use-api"),
    dryRun: hasFlag("dry-run"),
    maxRows: Number(arg("max-rows") ?? 5000),
    catalogId: arg("catalog-id"),
    advertiserSlug: arg("advertiser"),
    impactCatalogId: arg("impact-catalog-id"),
  });
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "data", "impact-ingest-report.json"),
    JSON.stringify(result.report, null, 2),
  );
  console.log("\n=== Impact ingest report ===");
  console.log(JSON.stringify(result.report, null, 2));
  console.log(
    `\nTouched ${result.graphs_touched} canonical graphs · ${result.published_synced} published to canonical-products.json`,
  );
}

async function cmdBuildCanonical() {
  const { buildCanonicalCatalog } = await import("./sources/build-canonical-catalog");
  const { report } = await buildCanonicalCatalog({
    cacheOnly: hasFlag("cache-only"),
    throttleMs: Number(arg("throttle-ms") ?? 1200),
    maxSeeds: Number(arg("max-seeds") ?? 9999),
    minOffers: Number(arg("min-offers") ?? 2),
  });
  console.log("\n=== Canonical catalog report ===");
  console.log(JSON.stringify(report, null, 2));
}

async function cmdSeedCanonical() {
  const { seedCanonicalInventory } = await import("./sources/seed-canonical-inventory");
  const report = seedCanonicalInventory(Number(arg("max") ?? 50));
  console.log("\n=== Inventory seed report ===");
  console.log(JSON.stringify(report, null, 2));
}

async function cmdEnrichAmazon() {
  const { buildAmazonEnrichedCatalog } = await import("./sources/amazon-enrich-catalog");
  const { saveProducts } = await import("./utils/storage");
  const cacheOnly = hasFlag("cache-only");
  const { products, report } = await buildAmazonEnrichedCatalog({
    cacheOnly,
    maxCatalogItems: Number(arg("max-catalog") ?? 9999),
    maxExtraQueries: Number(arg("max-queries") ?? 50),
    retailersPerItem: Number(arg("retailers-per-item") ?? 8),
    includeRetailerExpansion: !hasFlag("amazon-only"),
    throttleMs: Number(arg("throttle-ms") ?? 1200),
  });
  saveProducts(products, { chunkSize: 250, writeMonolith: true });
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "data", "amazon-enrich-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("\n=== Amazon enrichment report ===");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nPublished ${report.published} products → data/products.json`);
}

async function cmdQuality() {
  const { loadProducts, saveProducts } = await import("./utils/storage");
  const { filterCatalogQuality, scoreProductQuality } = await import("./utils/catalog-quality");
  const products = loadProducts();
  const scored = products.map((p) => {
    const s = scoreProductQuality(p);
    return { ...p, quality_score: s.overall, category: s.normalizedCategory };
  });
  const published = filterCatalogQuality(scored);
  saveProducts(published, { chunkSize: 250, writeMonolith: true });
  console.log(
    `[quality] ${products.length} → ${published.length} published (threshold via demo-commerce/quality)`,
  );
}

async function cmdBulk() {
  const report = await runBulkIngest({
    skipAdapters: hasFlag("skip-adapters"),
    skipScrape: hasFlag("skip-scrape"),
    skipAmazonPaapi: hasFlag("skip-paapi"),
    skipCatalogMatrix: !hasFlag("with-matrix"),
    withPrisma: hasFlag("with-prisma"),
    maxPerRetailer: Number(arg("max-per-retailer") ?? 80),
    maxAdapterQueries: Number(arg("max-queries") ?? 180),
    maxPaapiQueries: Number(arg("max-paapi-queries") ?? 120),
    validate: !hasFlag("skip-validate"),
  });
  console.log("\n=== bulk ingest report ===");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nPublished ${report.totalProducts} products → data/products.json`);
}

async function cmdIngest() {
  const retailersRaw = arg("retailers");
  const allRetailers = hasFlag("all-retailers");
  const retailers = allRetailers
    ? listUniqueRetailers().map((r) => r.retailer)
    : retailersRaw?.split(",").filter(Boolean);

  const report = await runIngest({
    retailers,
    maxPerRetailer: Number(arg("max-per-retailer") ?? 50),
    concurrency: Number(arg("concurrency") ?? 3),
    discoverLimit: Number(arg("discover-limit") ?? 120),
    validateLinks: !hasFlag("skip-validate"),
    incremental: !hasFlag("no-incremental"),
    chunkSize: Number(arg("chunk-size") ?? 250),
  });

  console.log("\n=== ingest report ===");
  console.log(JSON.stringify(report, null, 2));
}

async function cmdValidate() {
  const products = loadProducts();
  console.log(`[validate] checking ${products.length} products…`);
  const { kept, rejected } = await import("./utils/validate").then((m) =>
    m.validateAndFilterCatalog(products, {
      concurrency: Number(arg("concurrency") ?? 8),
      userAgent: DEFAULT_USER_AGENT,
    }),
  );
  const { filterCatalogQuality } = await import("./utils/quality");
  const published = filterCatalogQuality(kept);
  saveProducts(published, { chunkSize: 250, writeMonolith: true });
  console.log(`[validate] rejected ${rejected}, published ${published.length}`);
}

async function cmdSeed() {
  if (!hasFlag("force")) {
    console.log("[seed] Placeholder seed disabled. Use: npm run demo:bulk");
    console.log("      Or force placeholders: npm run demo:seed -- --force");
    const existing = loadProducts().filter((p) => !p.brand?.includes("Demo"));
    if (existing.length) {
      console.log(`[seed] ${existing.length} real products already in catalog`);
      return;
    }
  }

  const retailers = listUniqueRetailers().slice(0, 24);
  const samples: DemoProduct[] = [];
  const categories = ["Grocery", "Home", "Apparel", "Electronics", "Health", "Sports"];
  let n = 0;

  for (const { retailer, domain } of retailers) {
    for (let i = 0; i < 4 && n < 96; i++) {
      n++;
      const cat = categories[n % categories.length]!;
      const slug = `${retailer}-${cat.toLowerCase()}-${i + 1}`;
      samples.push({
        id: slug,
        retailer,
        retailer_domain: domain,
        title: `${cat} sample product ${i + 1} — ${retailer}`,
        brand: "Demo Brand",
        category: cat,
        price: 9.99 + (n % 50),
        currency: "USD",
        image_url: `https://placehold.co/400x400/png?text=${encodeURIComponent(retailer)}`,
        product_url: `https://www.${domain}/`,
        availability: "unknown",
        description: `Demo catalog item for ${retailer} (${domain}). Run npm run demo:ingest to replace with live scrapes.`,
        scraped_at: new Date().toISOString(),
        link_valid: true,
        image_valid: true,
      });
    }
  }

  saveProducts(samples, { chunkSize: 0, writeMonolith: true });
  console.log(`[seed] wrote ${samples.length} demo products to data/products.json`);
}

const cmd = process.argv[2] ?? "ingest";

async function main() {
  if (cmd === "seed") return cmdSeed();
  if (cmd === "validate") return cmdValidate();
  if (cmd === "ingest") return cmdIngest();
  if (cmd === "bulk") return cmdBulk();
  if (cmd === "quality") return cmdQuality();
  if (cmd === "enrich-amazon") return cmdEnrichAmazon();
  if (cmd === "build-canonical") return cmdBuildCanonical();
  if (cmd === "seed-canonical") return cmdSeedCanonical();
  if (cmd === "impact-ingest") return cmdImpactIngest();
  if (cmd === "eval-intelligence") return cmdEvalIntelligence();
  console.error(
    `Unknown command: ${cmd}. Use: bulk | build-canonical | seed-canonical | enrich-amazon | impact-ingest | eval-intelligence | ingest | validate | quality | seed`,
  );
  process.exit(1);
}

main().catch((e) => {
  console.error("[demo]", e);
  process.exit(1);
});
