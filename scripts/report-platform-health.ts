#!/usr/bin/env tsx
/** Platform health snapshot — persistence, ingestion, orchestration metrics. */
import { collectPlatformHealth } from "../src/lib/ops/data-observability";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const health = await collectPlatformHealth();
  console.log(JSON.stringify(health, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
