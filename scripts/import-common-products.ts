/**
 * Live product importer — pulls commonly-bought products from one or more
 * retailers via the REAL Bright Data ingestion pipeline, then runs them through
 * the validation pipeline so the ones that qualify publish (and become
 * searchable with a price offer).
 *
 * THIS HITS THE PAID BRIGHT DATA API. It estimates cost up front and waits for
 * confirmation unless --yes is passed. It aborts if query errors start repeating
 * (default: 3 consecutive failures) so a misconfigured run can't burn budget.
 *
 * Usage (the --conditions flag lets tsx load the pipeline's server-only modules):
 *   npx tsx --conditions=react-server scripts/import-common-products.ts [flags]
 *
 * Flags:
 *   --retailers=amazon,walmart,target   Which retailers to import (default: all 3)
 *   --limit=20                          Max rows KEPT per keyword query (default 20)
 *   --keywords=a,b,c                    Override keyword list for ALL retailers
 *   --keywords-amazon=a,b               Override keywords for one retailer
 *   --batch=200                         Validation batch size (default 200)
 *   --timeout=600000                    Max ms to wait per query (default 10 min)
 *   --concurrency=6                     Parallel Bright Data snapshots (default 6)
 *   --publish-mode=catalog              catalog (default) | pipeline | none.
 *                                       catalog = mint Product + offer directly
 *                                       (searchable, like IKEA); pipeline = run
 *                                       the conservative verification batch.
 *   --cost-per-record=0.0015            $ per Bright Data record, for the estimate
 *   --max-consecutive-errors=3          Abort after this many failures in a row
 *   --dry-run                           Estimate cost + plan only; NO API calls
 *   --no-validate                       Import only; skip the validation pipeline
 *   --no-link                           Skip the automatic cross-retailer linker
 *                                       that runs after a successful import
 *   --yes                               Skip the confirmation prompt
 *
 * Examples:
 *   npx tsx scripts/import-common-products.ts --dry-run
 *   npx tsx scripts/import-common-products.ts --retailers=amazon --limit=10 --yes
 */
import { createInterface } from "node:readline";
import { loadEnv } from "./load-env.mjs";

loadEnv();

import { prisma } from "../src/lib/db/prisma";
import { ingestRetailerProducts } from "../src/lib/pipeline/ingest";
import { runRawValidationBatch, validationStats } from "../src/lib/pipeline/batch";
import { buildNormalizedListing } from "../src/lib/pipeline/build-listing";
import { publishTrustedCatalogRecord } from "../src/lib/pipeline/canonical";
import { getRetailerConfigByName } from "../src/lib/pipeline/ingestion/retailer-config";
import { linkCrossRetailer } from "../src/lib/matching/link-cross-retailer";
import type { SourcingRetailer } from "../src/lib/pipeline/sourcing/retailer-strategy";

// ── Default keyword lists: common household / grocery / electronics ──────────
// ~14 keywords per retailer; at --limit=20 that's up to ~280 rows/retailer.
const COMMON_KEYWORDS: Record<string, string[]> = {
  amazon: [
    "paper towels", "laundry detergent", "dish soap", "trash bags",
    "coffee maker", "air fryer", "bluetooth headphones", "phone charger",
    "aa batteries", "toilet paper", "hand soap", "led light bulbs",
    "water bottle", "kitchen knife set",
  ],
  walmart: [
    "paper towels", "laundry detergent", "dish soap", "trash bags",
    "bottled water", "cereal", "peanut butter", "ground coffee",
    "shampoo", "toothpaste", "diapers", "dog food",
    "frozen pizza", "olive oil",
  ],
  target: [
    "paper towels", "laundry detergent", "dish soap", "storage bins",
    "throw pillow", "bath towels", "coffee mug", "scented candle",
    "notebook", "phone charger", "kids toys", "bluetooth speaker",
    "bedding set", "kitchen utensils",
  ],
};

interface Flags {
  retailers: SourcingRetailer[];
  limit: number;
  batch: number;
  costPerRecord: number;
  maxConsecutiveErrors: number;
  timeoutMs: number;
  concurrency: number;
  /** Hard ceiling on estimated spend (USD). The run ABORTS before any API call
   *  if the worst-case cost exceeds this. Default $10. */
  maxSpendUsd: number;
  /** Skip ingestion entirely; only (re)publish already-stored records. Zero API
   *  cost — for recovery after a DB drop, or re-publishing under a relaxed gate. */
  noIngest: boolean;
  /** How imported records become published:
   *  - catalog  (default): catalog-build — mint Product + offer directly for
   *    clean records (same path as IKEA's 190). Makes them searchable.
   *  - pipeline: run the conservative verification batch (matches an existing
   *    catalog; greenfield single-retailer items mostly land in NEEDS_REVIEW).
   *  - none: import only. */
  publishMode: "catalog" | "pipeline" | "none";
  dryRun: boolean;
  yes: boolean;
  /** Automatically run the cross-retailer linker after a successful import so
   *  newly-imported items merge with existing duplicates (one product, many
   *  retailer offers). On by default; --no-link skips it. Cross-retailer only —
   *  same-retailer dedup stays manual via scripts/link-cross-retailer.ts. */
  link: boolean;
  keywordOverrides: Record<string, string[]>;
}

function parseFlags(argv: string[]): Flags {
  const get = (name: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };
  const has = (name: string) => argv.includes(`--${name}`);
  const csv = (v: string | undefined) =>
    v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  const retailers = (csv(get("retailers")) ?? ["amazon", "walmart", "target"]) as SourcingRetailer[];

  const allKeywords = csv(get("keywords"));
  const keywordOverrides: Record<string, string[]> = {};
  for (const r of retailers) {
    const per = csv(get(`keywords-${r}`));
    if (per) keywordOverrides[r] = per;
    else if (allKeywords) keywordOverrides[r] = allKeywords;
  }

  return {
    retailers,
    limit: Number(get("limit") ?? 20),
    batch: Number(get("batch") ?? 200),
    costPerRecord: Number(get("cost-per-record") ?? 0.0015),
    maxConsecutiveErrors: Number(get("max-consecutive-errors") ?? 3),
    timeoutMs: Number(get("timeout") ?? 600_000),
    concurrency: Number(get("concurrency") ?? 6),
    maxSpendUsd: Number(get("max-spend") ?? 10),
    noIngest: has("no-ingest"),
    publishMode: has("no-validate")
      ? "none"
      : ((get("publish-mode") ?? "catalog") as Flags["publishMode"]),
    dryRun: has("dry-run"),
    yes: has("yes"),
    link: !has("no-link"),
    keywordOverrides,
  };
}

function keywordsFor(retailer: string, flags: Flags): string[] {
  return flags.keywordOverrides[retailer] ?? COMMON_KEYWORDS[retailer] ?? [];
}

/** Stable per-listing retailer id (ASIN / Walmart item id / Target TCIN) from the
 *  raw row JSON or the product URL — used as a fallback catalog identity. */
function retailerItemId(rec: { rawJson?: string | null; productUrl?: string | null }): string | null {
  try {
    const j = JSON.parse(rec.rawJson || "{}") as Record<string, unknown>;
    for (const k of ["asin", "item_id", "product_id", "tcin", "sku", "gtin"]) {
      const v = j[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  } catch { /* rawJson may be absent/non-JSON */ }
  const m = (rec.productUrl || "").match(/\/(?:dp|gp\/product|ip|p)\/(?:[^/]*-)?([A-Z0-9]{8,14})/i);
  return m ? m[1] : null;
}

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const runStart = new Date();

  // ── Plan + cost estimate ──────────────────────────────────────────────────
  console.log("\n=== Import plan ===");
  let totalQueries = 0;
  for (const r of flags.retailers) {
    const kws = keywordsFor(r, flags);
    totalQueries += kws.length;
    console.log(`  ${r.padEnd(8)} ${kws.length} keywords × up to ${flags.limit} rows`);
    console.log(`           keywords: ${kws.join(", ")}`);
  }
  const maxRecords = totalQueries * flags.limit;
  const estCost = maxRecords * flags.costPerRecord;
  // Worst case includes a safety buffer: Bright Data's limit_per_input can return
  // a little MORE than requested, so we budget 1.5× before trusting the run.
  const SAFETY = 1.5;
  const worstCaseCost = estCost * SAFETY;
  console.log(`\n  Queries:        ${totalQueries}`);
  console.log(`  Max records:    ~${maxRecords} (limit_per_input caps discovery at source)`);
  console.log(`  Cost/record:    $${flags.costPerRecord}`);
  console.log(`  ESTIMATED COST: ~$${estCost.toFixed(2)} (worst case ~$${worstCaseCost.toFixed(2)})`);
  console.log(`  SPEND CAP:      $${flags.maxSpendUsd.toFixed(2)} (--max-spend)`);
  console.log(`  Publish mode:   ${flags.publishMode}` +
    (flags.publishMode === "pipeline" ? ` (batch ${flags.batch})` : ""));

  // An uncapped limit means Bright Data discovery is NOT bounded at the source —
  // that's exactly the runaway that overspent before. Refuse to run.
  if (!flags.noIngest && (!flags.limit || flags.limit < 1)) {
    console.error(
      `\n!! ABORTED — --limit must be ≥ 1 so discovery is capped at the source ` +
      `(limit_per_input). Without it, Bright Data bills the entire crawl.\n`,
    );
    process.exit(1);
  }

  // HARD SPEND CAP — refuse to run when the worst-case estimate exceeds the cap.
  // This is the guardrail that prevents another runaway charge: the run never
  // starts (no API call, no billing) unless the budget math is safe.
  if (!flags.noIngest && worstCaseCost > flags.maxSpendUsd) {
    console.error(
      `\n!! ABORTED — worst-case cost ~$${worstCaseCost.toFixed(2)} exceeds the $${flags.maxSpendUsd.toFixed(2)} spend cap.\n` +
      `   Lower --limit or the number of keywords, or raise the cap with --max-spend=<usd>.\n` +
      `   (Tip: cost ≈ retailers × keywords × limit × $${flags.costPerRecord}.)\n`,
    );
    process.exit(1);
  }

  if (flags.dryRun) {
    console.log("\n--dry-run: no API calls made. Exiting.\n");
    return;
  }

  if (!flags.yes && !flags.noIngest) {
    const ok = await confirm(`\nProceed with the LIVE paid import above? (y/N) `);
    if (!ok) {
      console.log("Aborted by user. No API calls made.\n");
      return;
    }
  }

  // ── Ingest (concurrent pool) ──────────────────────────────────────────────
  // Bright Data keyword discovery is slow (minutes each), so we run several
  // snapshots in parallel: wall-clock ≈ slowest snapshot, not the sum. Each query
  // waits up to --timeout ms. We abort the whole run once errors pile up in a row
  // (e.g. a bad key or dataset) so a broken config can't keep spending.
  console.log(`\n=== Ingesting (live Bright Data, concurrency ${flags.concurrency}, ` +
    `timeout ${Math.round(flags.timeoutMs / 1000)}s/query) ===`);
  let imported = 0;
  let consecutiveErrors = 0;
  let aborted = false;
  const failures: { retailer: string; keyword: string; error: string }[] = [];

  const tasks: { retailer: SourcingRetailer; keyword: string }[] = [];
  for (const retailer of flags.retailers) {
    for (const keyword of keywordsFor(retailer, flags)) tasks.push({ retailer, keyword });
  }

  let next = 0;
  async function worker() {
    while (true) {
      if (aborted) return;
      const i = next++;
      if (i >= tasks.length) return;
      const { retailer, keyword } = tasks[i];
      try {
        const res = await ingestRetailerProducts({
          retailer,
          query: keyword,
          intent: "import",
          limit: flags.limit,
          timeoutMs: flags.timeoutMs,
        });
        imported += res.inserted;
        consecutiveErrors = 0;
        console.log(`  ✓ ${retailer.padEnd(8)} "${keyword}" → ${res.inserted} rows` +
          (res.snapshotId ? ` (snapshot ${res.snapshotId})` : ""));
      } catch (err) {
        consecutiveErrors += 1;
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ retailer, keyword, error: msg });
        console.error(`  ✗ ${retailer.padEnd(8)} "${keyword}" → ${msg}`);
        if (consecutiveErrors >= flags.maxConsecutiveErrors) {
          aborted = true;
          console.error(
            `\n!! ${consecutiveErrors} errors in a row — aborting to avoid burning budget. ` +
            `Fix the cause and re-run (already-imported rows are safe).\n`,
          );
          return;
        }
      }
    }
  }

  if (flags.noIngest) {
    console.log("  --no-ingest: skipping Bright Data; (re)publishing stored records only.");
  } else {
    await Promise.all(
      Array.from({ length: Math.min(flags.concurrency, tasks.length) }, () => worker()),
    );
    console.log(`\n  Imported ${imported} new raw records. Failures: ${failures.length}.`);
  }

  // ── Publish ───────────────────────────────────────────────────────────────
  let published = 0, needsReview = 0, rejected = 0, processed = 0, skipped = 0;
  if (flags.publishMode === "pipeline") {
    console.log("\n=== Publish: verification pipeline ===");
    // Drain the RAW/CHECKED/STALE queue in batches until nothing left to process.
    for (let pass = 1; ; pass++) {
      const summary = await runRawValidationBatch({ limit: flags.batch, useAi: true });
      processed += summary.processed;
      published += summary.published;
      needsReview += summary.needsReview;
      rejected += summary.rejected;
      console.log(`  pass ${pass}: processed ${summary.processed} ` +
        `(published ${summary.published}, review ${summary.needsReview}, rejected ${summary.rejected})`);
      if (summary.processed === 0) break;
    }
  } else if (flags.publishMode === "catalog") {
    // Catalog-build: mint a canonical Product + retailer offer directly for each
    // clean record (same path IKEA uses), so they're searchable immediately. We
    // require real identity + the fields the UI needs, and skip the rest.
    console.log("\n=== Publish: catalog build ===");
    const pending = await prisma.rawProductRecord.findMany({
      where: {
        retailer: { in: flags.retailers.map((r) => getRetailerConfigByName(r)?.name ?? r) },
        processingStatus: { in: ["RAW", "CHECKED", "NEEDS_REVIEW", "STALE"] },
      },
      orderBy: { scrapedAt: "desc" },
    });
    for (const rec of pending) {
      const listing = buildNormalizedListing(rec as never);
      // Retailer item id (ASIN / Walmart item id / Target TCIN) is a stable
      // per-listing identity — analogous to IKEA's item number. When a record has
      // no barcode and no model, adopt it as the identity so a clean listing is
      // still publishable (and dedupes deterministically) instead of being lost.
      const hasBarcode = Boolean(listing.upc || listing.gtin || listing.ean);
      const hasModel = Boolean(listing.brandNormalized && listing.modelNumberNormalized);
      if (!hasBarcode && !hasModel) {
        const itemId = retailerItemId(rec);
        if (itemId && listing.brandNormalized) {
          listing.modelNumber = itemId;
          listing.modelNumberNormalized = itemId.toLowerCase();
        }
      }
      const hasIdentity =
        hasBarcode || Boolean(listing.brandNormalized && listing.modelNumberNormalized);
      const usable =
        Boolean(listing.title) && (listing.price ?? 0) > 0 &&
        Boolean(rec.imageUrl?.startsWith("http")) && Boolean(rec.productUrl?.startsWith("http"));
      const retailerId = getRetailerConfigByName(rec.retailer)?.retailer;
      if (!hasIdentity || !usable || !retailerId) { skipped++; continue; }
      // Retry on transient DB drops (Neon closes long-lived connections). The
      // publish is idempotent, so a retry can't create duplicates.
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        try {
          await publishTrustedCatalogRecord(
            { id: rec.id, productUrl: rec.productUrl, imageUrl: rec.imageUrl, price: rec.price, retailerId },
            listing,
          );
          ok = true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (attempt === 3) {
            console.error(`  ✗ publish "${rec.title?.slice(0, 50)}": ${msg}`);
          } else {
            await new Promise((r) => setTimeout(r, 500 * attempt)); // backoff + reconnect
          }
        }
      }
      if (ok) { published++; processed++; } else { skipped++; }
    }
    console.log(`  catalog-build: published ${published}, skipped ${skipped} (weak identity / missing fields)`);
  }

  // ── Searchable count: products that got a live offer during this run ───────
  const freshOffers = await prisma.priceQuote.findMany({
    where: {
      providerSource: "bright_data",
      retailerId: { in: flags.retailers },
      fetchedAt: { gte: runStart },
      expiresAt: { gt: new Date() },
    },
    select: { productId: true },
    distinct: ["productId"],
  });
  const searchable = freshOffers.length;

  // ── Auto-link: merge newly-imported items with existing cross-retailer dupes ─
  // Runs only when this import actually published something. Cross-retailer only
  // and idempotent — safe to run every time. --no-link or --dry-run skips it.
  let linkResult: Awaited<ReturnType<typeof linkCrossRetailer>> | null = null;
  if (flags.link && !flags.dryRun && published > 0) {
    console.log("\n=== Cross-retailer linking (auto) ===");
    try {
      linkResult = await linkCrossRetailer({ apply: true, crossOnly: true });
      console.log(
        `  Linked ${linkResult.merged} clusters (${linkResult.crossRetailer} cross-retailer); ` +
        `moved ${linkResult.offersMoved} offers, retired ${linkResult.retired} duplicates.`,
      );
      for (const s of linkResult.samples.slice(0, 6)) console.log("    " + s);
    } catch (e) {
      // Linking is best-effort — a failure here must not fail the whole import.
      console.warn("  Auto-link failed (import data is intact; run scripts/link-cross-retailer.ts manually):", e);
    }
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  const stats = await validationStats();
  console.log("\n=== Final summary ===");
  console.log(`  Imported (new raw records): ${imported}`);
  console.log(`  Processed:                  ${processed}`);
  console.log(`  Published:                  ${published}`);
  console.log(`  Skipped (weak/incomplete):  ${skipped}`);
  console.log(`  Needs review:               ${needsReview}`);
  console.log(`  Rejected:                   ${rejected}`);
  console.log(`  Failed queries:             ${failures.length}`);
  console.log(`  Searchable (new w/ offer):  ${searchable}`);
  if (linkResult) {
    console.log(`  Cross-retailer merges:      ${linkResult.crossRetailer} (offers moved: ${linkResult.offersMoved})`);
  }
  console.log(`\n  DB totals → published: ${stats.published}, needsReview: ${stats.needsReview}, ` +
    `rejected: ${stats.rejected}, total raw: ${stats.total}`);
  if (failures.length) {
    console.log(`\n  Failure detail:`);
    for (const f of failures) console.log(`    - ${f.retailer} "${f.keyword}": ${f.error}`);
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error("\nimport-common-products failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
