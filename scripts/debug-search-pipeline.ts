#!/usr/bin/env tsx
/**
 * Trace search pipeline for natural-language queries.
 *
 *   npm run debug:search -- "mens pants joggers"
 *   npm run debug:search -- "mens joggers" "black hoodie" "nike running shoes"
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { enrichOffersAtSearch } from "../src/lib/offers/enrich-offers-at-search";
import { prepareResultsForDisplay } from "../src/lib/offers/offer-ranking";
import { finalizeResultsForUser } from "../src/lib/pricing/deal-intelligence";
import { finalizeSearchPrices } from "../src/lib/search/price-truth";
import { resolvePrimaryProduct } from "../src/lib/search/product-resolver";
import { runSearchWithLivePricing } from "../src/lib/search/live-pricing";
import {
  formatSearchPipelineTrace,
  traceSearchPipeline,
} from "../src/lib/search/search-pipeline-debug";
import type { ShoppingIntent } from "../src/lib/types";
import { prisma } from "../src/lib/db/prisma";

process.env.SEARCH_PIPELINE_DEBUG ??= "1";

const queries = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const write = process.argv.includes("--write");

const DEFAULT_QUERIES = [
  "mens pants joggers",
  "mens joggers",
  "black hoodie",
  "nike running shoes",
];

async function runQuery(raw: string) {
  const intent: ShoppingIntent = {
    query: raw,
    zipCode: "78701",
  };

  const { item } = resolvePrimaryProduct(intent);
  let { results } = await runSearchWithLivePricing(intent, item);
  results = finalizeSearchPrices(results);
  results = await enrichOffersAtSearch(results, item, intent);
  results = finalizeSearchPrices(results);
  results = await finalizeResultsForUser(results, item, intent);

  const trace = await traceSearchPipeline(intent, { afterEnrich: results, item });
  return { raw, trace, verified: results.online.length, low: results.lowConfidenceOnline?.length ?? 0 };
}

async function main() {
  const toRun = queries.length ? queries : DEFAULT_QUERIES;
  const sections: string[] = [`# Search pipeline debug`, "", `Generated: ${new Date().toISOString()}`, ""];

  for (const q of toRun) {
    console.error(`\n[debug:search] tracing "${q}"…`);
    const { trace, verified, low } = await runQuery(q);
    sections.push(formatSearchPipelineTrace(trace));
    sections.push("", `- **UI verified:** ${verified} · **low-confidence:** ${low}`, "");
    console.log(formatSearchPipelineTrace(trace));
    console.log(`→ verified=${verified} low=${low}`);
  }

  if (write) {
    const path = join(process.cwd(), "docs", "SEARCH_PIPELINE_DEBUG.md");
    writeFileSync(path, sections.join("\n"), "utf8");
    console.error(`\n[debug:search] wrote ${path}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
