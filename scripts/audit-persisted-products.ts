#!/usr/bin/env tsx
/**
 * List persisted verified quotes for manual PDP price verification.
 *
 *   npm run audit:persisted
 *   npm run audit:persisted -- --write --flagship
 */
import { writeFileSync } from "fs";
import { join } from "path";
import {
  computePersistedProductsReport,
  formatPersistedProductsMarkdown,
} from "../src/lib/inventory/persisted-products-report";
import { prisma } from "../src/lib/db/prisma";

const write = process.argv.includes("--write");
const flagshipOnly = process.argv.includes("--flagship");

async function main() {
  const report = await computePersistedProductsReport({ flagshipOnly });
  const md = formatPersistedProductsMarkdown(report);
  console.log(md);

  if (write) {
    const path = join(process.cwd(), "docs", "PERSISTED_PRODUCTS.md");
    writeFileSync(path, md, "utf8");
    console.error(`\n[audit:persisted] wrote ${path}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
