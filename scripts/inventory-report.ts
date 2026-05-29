#!/usr/bin/env node --import tsx/esm
/**
 * Generate inventory health report.
 *
 *   npm run inventory:report
 *   npm run inventory:report -- --write
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { computeInventoryHealth } from "../src/lib/inventory/inventory-health";

const write = process.argv.includes("--write");

async function main() {
  const inv = await computeInventoryHealth();
  const c = inv.operational.coverage;

  const lines = [
    "# Inventory Health Report",
    "",
    `Generated: ${inv.generatedAt}`,
    "",
    "## Product-count reality",
    "",
    "| Metric | Count |",
    "|--------|------:|",
    `| Curated canonical catalog (in-memory) | ${inv.inMemoryCatalogSize} |`,
    `| Canonical products in DB | ${inv.canonicalProductCount} |`,
    `| Production-usable products | ${inv.productionUsable} (${c.pctProductionUsable.toFixed(1)}%) |`,
    `| Total PriceQuote rows | ${inv.totalPriceQuoteRows} |`,
    `| Verified quote rows (all time) | ${inv.verifiedQuoteRows} |`,
    `| **Active verified quotes** | **${inv.activeVerifiedQuotes}** |`,
    `| Expired verified (needs re-index) | ${inv.expiredVerifiedQuotes} |`,
    `| Catalog estimate rows | ${inv.estimateQuoteRows} |`,
    `| Unique retailer PDPs (RetailerProductIdentity) | ${inv.uniqueRetailerPdps} |`,
    `| PDPs linked to canonical product | ${inv.linkedRetailerPdps} |`,
    `| Product identifier graph edges | ${inv.productIdentifierCount} |`,
    `| Products with 2+ retailer overlap (active) | ${inv.productsWith2PlusRetailers} |`,
    `| Products with 3+ retailer overlap | ${inv.productsWith3PlusRetailers} |`,
    "",
    "> **Real inventory size for demos:** active verified products with cross-retailer overlap — not raw catalog count.",
    "",
    "## Category coverage",
    "",
    "| Category | Canonical | Active | Expired | 2+ retailers | Prod-usable |",
    "|----------|----------:|-------:|--------:|-------------:|------------:|",
    ...inv.byCategory.map(
      (r) =>
        `| ${r.category} | ${r.canonicalCount} | ${r.activeVerified} | ${r.expiredVerified} | ${r.overlap2Plus} | ${r.productionUsable} |`,
    ),
    "",
    "See docs/INVENTORY_STRATEGY.md for architecture and scaling plan.",
  ];

  const md = lines.join("\n");
  console.log(md);

  if (write) {
    const path = join(process.cwd(), "docs", "INVENTORY_HEALTH.md");
    writeFileSync(path, md, "utf8");
    console.error(`\n[inventory:report] wrote ${path}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
