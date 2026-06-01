#!/usr/bin/env tsx
/**
 * Generate retailer readiness report (Amazon, Target, registry retailers).
 *
 *   npm run report:retailer-readiness
 *   npm run report:retailer-readiness -- --json
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  generateRetailerReadinessReport,
  formatReadinessReportMarkdown,
} from "../src/lib/ops/retailer-readiness-report";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const jsonOut = process.argv.includes("--json");
  const report = await generateRetailerReadinessReport();

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReadinessReportMarkdown(report));
  }

  const outDir = join(process.cwd(), "artifacts", "ops");
  await mkdir(outDir, { recursive: true });
  const ts = report.generatedAt.replace(/[:.]/g, "-");
  await writeFile(join(outDir, `retailer-readiness-${ts}.json`), JSON.stringify(report, null, 2));
  await writeFile(join(outDir, "retailer-readiness-latest.json"), JSON.stringify(report, null, 2));
  await writeFile(join(outDir, "retailer-readiness-latest.md"), formatReadinessReportMarkdown(report));

  if (!jsonOut) {
    console.log("\nWrote artifacts/ops/retailer-readiness-latest.{json,md}");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
