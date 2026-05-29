#!/usr/bin/env tsx
/**
 * Data quality diagnostics — price drift, image dupes, link failures.
 *
 *   npm run audit:data-quality
 *   npm run audit:data-quality -- --write
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { runDataQualityAudit } from "../src/lib/audit/data-quality-audit";

const write = process.argv.includes("--write");

async function main() {
  const report = await runDataQualityAudit();

  const lines = [
    "# Data Quality Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|------:|`,
    `| Flagship products | ${report.flagshipCount} |`,
    `| Deprioritized catalog (apparel/bedding) | ${report.deprioritizedCatalogCount} |`,
    `| Price drift failures | ${report.priceDrift.failCount} |`,
    `| Price drift warnings | ${report.priceDrift.warnCount} |`,
    `| Duplicate catalog image groups | ${report.imageDuplicates.rows.length} |`,
    `| Generic catalog image rate | ${report.imageDuplicates.genericImageRate}% |`,
    `| Link failure rate (verified quotes) | ${report.linkFailures.failureRate}% |`,
    `| Low-confidence quotes (<0.72) | ${report.structuredDataHints.lowConfidenceQuotes} |`,
    `| Placeholder images in verified quotes | ${report.structuredDataHints.placeholderImages} |`,
    "",
    "## Recommendations",
    "",
    ...report.recommendations.map((r) => `- ${r}`),
    "",
    "## Price drift (top issues)",
    "",
    "| Product | Retailer | Catalog | Quoted | Drift | Severity |",
    "|---------|----------|--------:|-------:|------:|----------|",
    ...report.priceDrift.rows
      .filter((r) => r.severity !== "ok")
      .slice(0, 15)
      .map(
        (r) =>
          `| ${r.catalogId} | ${r.retailerId} | $${r.catalogBase} | $${r.quotedPrice} | ${r.driftPct}% | ${r.severity} |`,
      ),
    "",
    "## Duplicate catalog images",
    "",
    ...report.imageDuplicates.rows.slice(0, 10).map(
      (r) =>
        `- **${r.productCount} products** share image (${r.isGeneric ? "generic" : "unique"}): ${r.catalogIds.join(", ")}`,
    ),
    "",
    "## Link failures",
    "",
    ...report.linkFailures.rows.slice(0, 10).map(
      (r) => `- \`${r.catalogId}\` @ ${r.retailerId}: ${r.issue} — ${r.productUrl || "(empty)"}`,
    ),
  ];

  const md = lines.join("\n");
  console.log(md);

  if (write) {
    const path = join(process.cwd(), "docs", "DATA_QUALITY_AUDIT.md");
    writeFileSync(path, md, "utf8");
    console.error(`\n[audit:data-quality] wrote ${path}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
