/**
 * End-to-end IKEA test import using REAL Bright Data output + the REAL mapping
 * code (mapBrightDataRow). Reads a downloaded snapshot, maps via config field
 * aliases, inserts RawProductRecords, and prints the parsed fields so we can
 * confirm titles/prices/images/links/availability parse correctly and that no
 * schema errors occur.
 *
 *   npx tsx scripts/ikea-test-import.ts /tmp/ikea3.json
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { mapBrightDataRow } from "../src/lib/pipeline/ingestion/normalize-row";
import { getRetailerConfig } from "../src/lib/pipeline/ingestion/retailer-config";

const prisma = new PrismaClient();

async function main() {
  const file = process.argv[2] ?? "/tmp/ikea3.json";
  const rows = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>[];
  const config = getRetailerConfig("ikea");

  console.log(`Mapping ${rows.length} IKEA rows via real mapBrightDataRow()…\n`);
  const mapped = rows.map((r) => mapBrightDataRow(r, config));

  for (const m of mapped) {
    console.log(`• ${m.title}`);
    console.log(`    price=$${m.price}  brand=${m.brand}  item#=${m.modelNumber}  stock=${m.availability}`);
    console.log(`    image=${m.imageUrl?.slice(0, 70)}`);
    console.log(`    url=${m.productUrl}`);
    // Validate the fields the UI needs are present and well-typed.
    const problems: string[] = [];
    if (!m.title) problems.push("missing title");
    if (typeof m.price !== "number" || m.price <= 0) problems.push("bad price");
    if (!m.imageUrl?.startsWith("http")) problems.push("bad image url");
    if (!m.productUrl?.startsWith("http")) problems.push("bad product url");
    console.log(`    ${problems.length ? "✗ " + problems.join(", ") : "✓ fields OK"}\n`);
  }

  // Insert as RAW records (skip duplicates by productUrl so re-runs are safe).
  let inserted = 0;
  for (const m of mapped) {
    const exists = m.productUrl
      ? await prisma.rawProductRecord.findFirst({ where: { productUrl: m.productUrl } })
      : null;
    if (exists) {
      console.log(`(skip existing) ${m.title}`);
      continue;
    }
    await prisma.rawProductRecord.create({ data: m });
    inserted += 1;
  }
  console.log(`\nInserted ${inserted} new RawProductRecords (status RAW). No schema errors.`);

  const total = await prisma.rawProductRecord.count({ where: { retailer: "IKEA" } });
  console.log(`Total IKEA raw records in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error("test import failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
