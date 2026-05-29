#!/usr/bin/env node
/**
 * Evidence script: DB rows + simulated scrape/replace for jeans-slim.
 * Usage:
 *   PIPELINE_DEBUG=1 node scripts/verify-pipeline.mjs
 *   node scripts/verify-pipeline.mjs --catalog-id=jeans-slim
 */
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const catalogId = process.argv.find((a) => a.startsWith("--catalog-id="))?.split("=")[1] ?? "jeans-slim";

import { readFileSync } from "node:fs";

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadEnv();

const prisma = new PrismaClient();

function rowLine(r) {
  return {
    source: r.source,
    retailer: r.retailerId,
    priceUsd: r.priceUsd,
    imageUrl: r.imageUrl?.slice(0, 72) ?? null,
    productUrl: r.productUrl?.slice(0, 88) ?? null,
    fetchedAt: r.fetchedAt?.toISOString?.() ?? r.fetchedAt,
    expiresAt: r.expiresAt?.toISOString?.() ?? r.expiresAt,
  };
}

async function quotesForCatalog(id) {
  const product = await prisma.product.findUnique({ where: { catalogId: id } });
  if (!product) return { product: null, rows: [] };
  const rows = await prisma.priceQuote.findMany({
    where: { productId: product.id },
    orderBy: { fetchedAt: "desc" },
    take: 30,
  });
  return { product, rows };
}

console.log("\n=== Shop Scout pipeline verification ===\n");
console.log("DATABASE_URL:", process.env.DATABASE_URL ?? "(default)");
console.log("catalogId:", catalogId);

const before = await quotesForCatalog(catalogId);
if (!before.product) {
  console.log("\nNo Product row — run: npm run bootstrap:db\n");
  await prisma.$disconnect();
  process.exit(1);
}

console.log("\n--- BEFORE (all PriceQuote sources) ---");
const bySource = {};
for (const r of before.rows) {
  bySource[r.source] = (bySource[r.source] ?? 0) + 1;
}
console.log("counts by source:", bySource);
for (const r of before.rows.slice(0, 8)) {
  console.log(JSON.stringify(rowLine(r)));
}

const estimate = before.rows.find((r) => r.source === "catalog_estimate");
const scraped = before.rows.find((r) => r.source === "scraped");
console.log("\n--- Example rows ---");
console.log("catalog_estimate:", estimate ? rowLine(estimate) : "(none)");
console.log("scraped:", scraped ? rowLine(scraped) : "(none)");

console.log("\n--- Running in-process search scrape (tsx) ---");
try {
  execSync(
    `npx tsx scripts/verify-pipeline-search.ts --catalog-id=${catalogId}`,
    { cwd: root, stdio: "inherit", env: { ...process.env, PIPELINE_DEBUG: "1" } },
  );
} catch (e) {
  console.error("Search scrape script failed:", e.message);
}

const after = await quotesForCatalog(catalogId);
console.log("\n--- AFTER ---");
const bySourceAfter = {};
for (const r of after.rows) {
  bySourceAfter[r.source] = (bySourceAfter[r.source] ?? 0) + 1;
}
console.log("counts by source:", bySourceAfter);
for (const r of after.rows.filter((x) => x.source === "scraped").slice(0, 5)) {
  console.log(JSON.stringify(rowLine(r)));
}

const walmartScraped = after.rows.find(
  (r) => r.source === "scraped" && r.retailerId === "walmart",
);
if (walmartScraped) {
  console.log("\n✓ Stale replacement check: scraped walmart row exists at", walmartScraped.priceUsd);
} else {
  console.log("\n⚠ No scraped walmart row yet (bot block or scrape disabled)");
}

await prisma.$disconnect();
console.log("\nDone.\n");
