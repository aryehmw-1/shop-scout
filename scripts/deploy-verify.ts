#!/usr/bin/env tsx
/**
 * Pre-deploy gate: typecheck + module integrity + intelligence smoke.
 */
import { spawnSync } from "node:child_process";
import { runDeployVerification } from "../src/lib/commerce-intelligence/ops/deploy-verify";

const pre = spawnSync("node", ["scripts/verify-build-imports.mjs"], {
  stdio: "inherit",
  encoding: "utf8",
});
if (pre.status !== 0) process.exit(pre.status ?? 1);

const report = runDeployVerification();
console.log(JSON.stringify(report, null, 2));

if (!report.ready) {
  console.error("\n[deploy-verify] NOT READY");
  if (!report.modules.ok) {
    console.error("  missing modules:", report.modules.missing.join(", "));
  }
  if (!report.catalog.demoReady) {
    console.error("  catalog:", report.catalog.alerts.join("; "));
  }
  if (!report.runtime.ok) {
    console.error("  runtime:", report.runtime.checks);
  }
  process.exit(1);
}
console.log("\n[deploy-verify] ready");
