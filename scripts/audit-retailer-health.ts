#!/usr/bin/env tsx
/**
 * Retailer health audit — proxy status, fetch profiles, DB quality metrics.
 *
 *   npm run audit:retailer-health
 */
import { prisma } from "../src/lib/db/prisma";
import {
  proxyUrlPool,
  warnIfProxyMisconfigured,
} from "../src/lib/offers/retailer-adapters/retailer-fetch";
import { retailersPreferringProxy } from "../src/lib/offers/retailer-adapters/fetch-profiles";

async function main() {
  warnIfProxyMisconfigured();
  const proxies = proxyUrlPool();
  const prefer = retailersPreferringProxy();

  console.log("# Retailer health audit\n");
  console.log(`Proxy pool: ${proxies.length ? `${proxies.length} URL(s)` : "**NOT CONFIGURED**"}`);
  console.log(`Retailers preferring proxy: ${prefer.join(", ")}\n`);

  const metrics = await prisma.retailerQualityMetric.findMany({
    orderBy: { fetchAttempts: "desc" },
  });

  if (!metrics.length) {
    console.log("No RetailerQualityMetric rows yet — run `npm run phase0:refresh` first.\n");
  } else {
    console.log("| Retailer | Fetch OK | Parser OK | Persist OK | Trust | Avg conf |");
    console.log("|----------|--------:|----------:|-----------:|------:|---------:|");
    for (const m of metrics) {
      const fetchPct =
        m.fetchAttempts > 0 ?
          Math.round((m.fetchSuccesses / m.fetchAttempts) * 100)
        : 0;
      const parserPct =
        m.parserAttempts > 0 ?
          Math.round((m.parserSuccesses / m.parserAttempts) * 100)
        : 0;
      const persistTotal = m.offersAccepted + m.offersRejected;
      const persistPct =
        persistTotal > 0 ? Math.round((m.offersAccepted / persistTotal) * 100) : 0;
      console.log(
        `| ${m.retailerId} | ${fetchPct}% | ${parserPct}% | ${persistPct}% | ${m.trustScore.toFixed(2)} | ${m.avgMatchConfidence.toFixed(2)} |`,
      );
    }
  }

  const activeVerified = await prisma.priceQuote.count({
    where: {
      source: { in: ["scraped", "connector_api"] },
      expiresAt: { gt: new Date() },
    },
  });
  console.log(`\nActive verified quotes in DB: **${activeVerified}**`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
