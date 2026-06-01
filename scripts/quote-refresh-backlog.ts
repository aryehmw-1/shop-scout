#!/usr/bin/env node
/** Print proactive quote refresh backlog (priority queue). */
import { buildQuoteRefreshBacklog } from "../src/lib/indexing/quote-refresh-scheduler";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const backlog = await buildQuoteRefreshBacklog(30);
  console.log(JSON.stringify(backlog, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
