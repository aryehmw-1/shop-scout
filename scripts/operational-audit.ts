#!/usr/bin/env node --import tsx/esm
/**
 * Full operational audit — measurable production readiness.
 *
 *   npm run audit:ops
 *   npm run audit:ops -- --json
 *   npm run audit:ops -- --write
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { runOperationalAudit } from "../src/lib/audit/operational-audit.ts";
import { formatAuditMarkdown } from "../src/lib/audit/format-audit-report.ts";

const write = process.argv.includes("--write");
const asJson = process.argv.includes("--json");

async function main() {
  console.log("[audit:ops] running operational audit…");
  const report = await runOperationalAudit();

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const md = formatAuditMarkdown(report);
    console.log(md);
    if (write) {
      const outPath = join(process.cwd(), "docs", "OPERATIONAL_AUDIT.md");
      writeFileSync(outPath, md, "utf8");
      console.error(`\n[audit:ops] wrote ${outPath}`);
    }
  }

  const c = report.coverage;
  console.error(
    `\n[audit:ops] summary: ${c.productionUsable}/${c.totalCatalogProducts} production-usable (${c.pctProductionUsable.toFixed(1)}%), ${c.withVerifiedOffers} verified, ${report.gradeDistribution.A} A-grade`,
  );
}

main().catch((e) => {
  console.error("[audit:ops] failed", e);
  process.exit(1);
});
