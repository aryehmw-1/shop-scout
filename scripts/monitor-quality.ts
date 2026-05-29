#!/usr/bin/env tsx
/**
 * Lightweight quality regression monitor — run via cron or manually.
 * npm run monitor:quality
 */
import { runQualityChecks } from "../src/lib/monitoring/quality-alerts";

async function main() {
  const alerts = await runQualityChecks();

  if (!alerts.length) {
    console.log("[monitor] All checks passed — no alerts.");
    process.exit(0);
  }

  console.log(`[monitor] ${alerts.length} alert(s):\n`);
  for (const a of alerts) {
    const tag = a.severity.toUpperCase().padEnd(8);
    console.log(`  [${tag}] ${a.title}`);
    console.log(`           ${a.detail}\n`);
  }

  const critical = alerts.some((a) => a.severity === "critical");
  process.exit(critical ? 1 : 0);
}

main().catch((e) => {
  console.error("[monitor] failed", e);
  process.exit(2);
});
