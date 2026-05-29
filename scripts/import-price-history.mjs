/**
 * Import price history CSV (no tsx required).
 *   node scripts/import-price-history.mjs data/price-history.example.csv
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FIVE_YEARS_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (!lines.length) return [];
  const hasHeader = lines[0].toLowerCase().startsWith("catalog_id");
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows = [];
  for (const line of dataLines) {
    const p = line.split(",").map((x) => x.trim());
    if (p.length < 5) continue;
    const priceUsd = Number(p[3]);
    const observedAt = new Date(p[4]);
    if (!p[0] || !p[1] || !Number.isFinite(priceUsd) || Number.isNaN(observedAt)) continue;
    rows.push({
      catalogId: p[0],
      retailerId: p[1],
      channel: p[2] || "online",
      priceUsd,
      observedAt,
      source: p[5] || "import",
    });
  }
  return rows;
}

function utcDayStart(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: node scripts/import-price-history.mjs <file.csv> [--dry-run]");
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(resolve(file), "utf8"));
  console.log(`Parsed ${rows.length} rows`);
  if (dryRun) {
    console.log(rows.slice(0, 3));
    return;
  }

  const products = await prisma.product.findMany({
    select: { id: true, catalogId: true },
  });
  const byCatalog = new Map(products.map((p) => [p.catalogId, p.id]));
  let inserted = 0;
  let skipped = 0;
  const touched = new Set();

  for (const row of rows) {
    const productId = byCatalog.get(row.catalogId);
    if (!productId) {
      skipped++;
      continue;
    }
    const dayStart = utcDayStart(row.observedAt);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const existing = await prisma.priceHistorySnapshot.findFirst({
      where: {
        productId,
        retailerId: row.retailerId,
        channel: row.channel,
        observedAt: { gte: dayStart, lt: dayEnd },
      },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.priceHistorySnapshot.create({
      data: {
        productId,
        retailerId: row.retailerId,
        channel: row.channel,
        priceUsd: row.priceUsd,
        source: row.source,
        observedAt: row.observedAt,
      },
    });
    inserted++;
    touched.add(productId);
  }

  const cutoff = new Date(Date.now() - FIVE_YEARS_MS);
  for (const productId of touched) {
    await prisma.priceHistorySnapshot.deleteMany({
      where: { productId, observedAt: { lt: cutoff } },
    });
  }

  console.log(`Done: inserted ${inserted}, skipped ${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
