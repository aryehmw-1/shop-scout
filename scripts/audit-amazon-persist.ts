#!/usr/bin/env tsx
/**
 * Diagnose Amazon persist failures for flagship products.
 *
 *   npm run audit:amazon-persist
 *   npm run audit:amazon-persist -- --limit=5 --write
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { CATALOG } from "../src/lib/retailers/catalog";
import { compareProduct } from "../src/lib/retailers/catalog";
import { getFlagshipCatalogIds } from "../src/lib/inventory/flagship-catalog";
import { enrichOffersAtIndex } from "../src/lib/offers/enrich-index-offers";
import { finalizeSearchPrices } from "../src/lib/search/price-truth";
import {
  diagnoseAmazonOfferPersist,
  formatAmazonPersistDiagnostic,
} from "../src/lib/audit/amazon-persist-diagnostics";
import { validateOfferBeforePersist } from "../src/lib/offers/offer-persist-validation";
import type { ShoppingIntent } from "../src/lib/types";

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : 8;
const write = process.argv.includes("--write");

process.env.INDEX_AMAZON_PERSIST_DIAG ??= "1";

function intentFor(item: { brand: string; title: string; category: string }): ShoppingIntent {
  return {
    query: [item.brand, item.title].filter(Boolean).join(" "),
    category: item.category,
    zipCode: "78701",
  };
}

async function main() {
  const ids = getFlagshipCatalogIds().slice(0, limit);
  const rejectionCounts = new Map<string, number>();
  const rootCauseCounts = new Map<string, number>();
  const sections: string[] = [
    "# Amazon persist diagnostics",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
  ];

  let persistPass = 0;
  let persistFail = 0;

  for (const catalogId of ids) {
    const item = CATALOG.find((c) => c.id === catalogId);
    if (!item) continue;

    const intent = intentFor(item);
    let results = compareProduct(item, intent, { retailers: ["amazon", "walmart", "target"] });
    results = finalizeSearchPrices(results);

    const amazonOffer = results.online.find((o) => o.retailer === "amazon");
    if (!amazonOffer) {
      sections.push(`### ${catalogId}\n- No Amazon offer in compare grid\n`);
      continue;
    }

    const baselineConf = amazonOffer.matchConfidence ?? 0;
    const baselineSource = amazonOffer.priceSource ?? "catalog_model";

    const enrichPass = await enrichOffersAtIndex(results, item, intent);
    results = enrichPass.results;

    const enrichedAmazon =
      [...results.online, ...results.local].find((o) => o.retailer === "amazon") ??
      amazonOffer;

    const diag = diagnoseAmazonOfferPersist(enrichedAmazon, item, intent);
    const persist = validateOfferBeforePersist(enrichedAmazon, item, intent);

    if (persist.ok) persistPass += 1;
    else persistFail += 1;

    const reason = persist.reason ?? "unknown";
    rejectionCounts.set(reason, (rejectionCounts.get(reason) ?? 0) + 1);
    rootCauseCounts.set(
      diag.likelyRootCause,
      (rootCauseCounts.get(diag.likelyRootCause) ?? 0) + 1,
    );

    sections.push(formatAmazonPersistDiagnostic(diag));
    sections.push(
      `- **Confidence arc:** compare=${baselineConf.toFixed(3)} (${baselineSource}) → final=${(enrichedAmazon.matchConfidence ?? 0).toFixed(3)} (${enrichedAmazon.priceSource ?? "?"})`,
    );
    sections.push(
      `- **Enrichment:** pricesExtracted=${enrichPass.report.pricesExtracted} persistRejected=${enrichPass.report.persistRejected ?? 0}`,
    );
    sections.push("");
  }

  sections.splice(
    4,
    0,
    "## Summary",
    "",
    `- Products tested: ${ids.length}`,
    `- Amazon persist pass: **${persistPass}**`,
    `- Amazon persist fail: **${persistFail}**`,
    "",
    "### Persist rejection reasons",
    "",
    ...[...rejectionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- \`${k}\`: ${v}`),
    "",
    "### Likely root causes",
    "",
    ...[...rootCauseCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- ${k}: ${v}`),
    "",
  );

  const md = sections.join("\n");
  console.log(md);

  if (write) {
    const path = join(process.cwd(), "docs", "AMAZON_PERSIST_DIAGNOSTICS.md");
    writeFileSync(path, md, "utf8");
    console.error(`\n[audit:amazon-persist] wrote ${path}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
