/**
 * UPC-anchored enrichment (Priority 4 canary).
 *
 * Instead of waiting for keyword crawls to coincidentally surface the same item
 * at two retailers, this ACTIVELY searches competitor retailers by the barcode
 * of a product we already trust. For each known-good single-retailer product
 * that carries a UPC/GTIN, we query the OTHER barcode-capable retailers by that
 * exact barcode (Bright Data `upc_lookup`), catalog-build whatever comes back,
 * and let the cross-retailer linker merge it in on the shared `code:` identity.
 *
 * Only Amazon and Target expose a `upc_lookup` operation; Walmart's dataset
 * discovers by its own item-id (`sku_lookup`), not UPC, so Walmart can be a
 * SOURCE of barcodes but not a TARGET of UPC search. That's surfaced in the plan.
 *
 * THIS HITS THE PAID BRIGHT DATA API. Like the importer it estimates worst-case
 * cost up front, enforces a hard --max-spend cap, and won't make a single call
 * in --dry-run. Designed as a SMALL canary: default 15 products.
 *
 *   npx tsx --conditions=react-server scripts/enrich-by-upc.ts --dry-run
 *   npx tsx --conditions=react-server scripts/enrich-by-upc.ts --limit-products=15 --yes
 *
 * Flags:
 *   --limit-products=15     Max candidate products to enrich this run (canary cap)
 *   --rows-per-lookup=3     Rows KEPT per upc_lookup call (limit_per_input)
 *   --max-spend=5           Hard worst-case spend cap in USD (default $5)
 *   --cost-per-record=0.0015  $ per Bright Data record, for the estimate
 *   --timeout=600000        Max ms to wait per lookup (default 10 min)
 *   --concurrency=4         Parallel Bright Data snapshots
 *   --category=<substr>     Only consider products whose category contains this
 *   --dry-run               Plan + cost estimate only; NO API calls
 *   --no-link               Skip the cross-retailer linker afterward
 *   --yes                   Skip the confirmation prompt
 */
import { createInterface } from "node:readline";
import { loadEnv } from "./load-env.mjs";

loadEnv();

import { prisma } from "../src/lib/db/prisma";
import { ingestRetailerProducts } from "../src/lib/pipeline/ingest";
import { buildNormalizedListing } from "../src/lib/pipeline/build-listing";
import { publishTrustedCatalogRecord } from "../src/lib/pipeline/canonical";
import { getRetailerConfigByName } from "../src/lib/pipeline/ingestion/retailer-config";
import { linkCrossRetailer } from "../src/lib/matching/link-cross-retailer";
import { corroborateUpcStamp } from "../src/lib/matching/upc-corroboration";
import type { SourcingRetailer } from "../src/lib/pipeline/sourcing/retailer-strategy";

// Retailers whose Bright Data dataset supports discover-by-UPC. Walmart is
// intentionally absent — it discovers by its own item id (sku_lookup), not UPC.
const UPC_CAPABLE: SourcingRetailer[] = ["amazon", "target"];

interface Flags {
  limitProducts: number;
  rowsPerLookup: number;
  maxSpendUsd: number;
  costPerRecord: number;
  timeoutMs: number;
  concurrency: number;
  category?: string;
  dryRun: boolean;
  link: boolean;
  yes: boolean;
}

function parseFlags(argv: string[]): Flags {
  const get = (name: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : undefined;
  };
  const has = (name: string) => argv.includes(`--${name}`);
  return {
    limitProducts: Number(get("limit-products") ?? 15),
    rowsPerLookup: Number(get("rows-per-lookup") ?? 3),
    maxSpendUsd: Number(get("max-spend") ?? 5),
    costPerRecord: Number(get("cost-per-record") ?? 0.0015),
    timeoutMs: Number(get("timeout") ?? 600_000),
    concurrency: Number(get("concurrency") ?? 4),
    category: get("category"),
    dryRun: has("dry-run"),
    link: !has("no-link"),
    yes: has("yes"),
  };
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

interface Candidate {
  productId: string;
  title: string;
  brand: string | null;
  sizeLabel: string | null;
  barcode: string;
  haveRetailers: string[];   // retailer ids that already have a live offer
  queryRetailers: SourcingRetailer[]; // upc-capable retailers we still lack
}

/** Return a single clean barcode (8–14 digits) or null. Some products carry a
 *  space-joined list of identifiers in the gtin/upc field — a UPC search needs
 *  exactly one numeric code, so we take the first valid token and reject junk. */
function cleanBarcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const tok of raw.trim().split(/\s+/)) {
    const d = tok.replace(/[^0-9]/g, "");
    if (d.length >= 8 && d.length <= 14) return d;
  }
  return null;
}

/** Count distinct retailers across the catalog's currently-live offers — the
 *  "multi-retailer" metric the user wants a before/after for. */
async function multiRetailerProductCount(): Promise<number> {
  const rows = await prisma.priceQuote.findMany({
    where: { inStock: true, expiresAt: { gt: new Date() }, product: { published: true } },
    select: { productId: true, retailerId: true },
  });
  const byProduct = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byProduct.has(r.productId)) byProduct.set(r.productId, new Set());
    byProduct.get(r.productId)!.add(r.retailerId);
  }
  let multi = 0;
  for (const set of byProduct.values()) if (set.size >= 2) multi++;
  return multi;
}

/** Pick known-good products that carry a barcode and are missing at least one
 *  UPC-capable retailer, so a UPC search could plausibly add an offer. */
async function selectCandidates(flags: Flags): Promise<Candidate[]> {
  const products = await prisma.product.findMany({
    where: {
      published: true,
      OR: [{ upc: { not: null } }, { gtin: { not: null } }],
      ...(flags.category ? { category: { contains: flags.category, mode: "insensitive" } } : {}),
    },
    select: {
      id: true, title: true, brand: true, sizeLabel: true, upc: true, gtin: true,
      priceQuotes: {
        where: { inStock: true, expiresAt: { gt: new Date() } },
        select: { retailerId: true, providerSource: true },
      },
    },
    orderBy: { lastVerifiedAt: "desc" },
  });

  const candidates: Candidate[] = [];
  for (const p of products) {
    const barcode = cleanBarcode(p.gtin) ?? cleanBarcode(p.upc);
    if (!barcode) continue;
    // Real, sourced products only — at least one live offer scraped from a
    // retailer (excludes synthetic seed data whose barcodes don't resolve).
    const liveQuotes = p.priceQuotes.filter((q) => q.providerSource === "bright_data");
    const haveRetailers = [...new Set(liveQuotes.map((q) => q.retailerId))];
    if (haveRetailers.length === 0) continue;
    const queryRetailers = UPC_CAPABLE.filter((r) => !haveRetailers.includes(r));
    if (queryRetailers.length === 0) continue; // already covered on every upc-capable retailer
    candidates.push({ productId: p.id, title: p.title, brand: p.brand, sizeLabel: p.sizeLabel, barcode, haveRetailers, queryRetailers });
    if (candidates.length >= flags.limitProducts) break;
  }
  return candidates;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const runStart = new Date();

  console.log("\n=== UPC-anchored enrichment plan (canary) ===");
  console.log(`  UPC-capable target retailers: ${UPC_CAPABLE.join(", ")} (Walmart excluded — no upc_lookup)`);

  const candidates = await selectCandidates(flags);
  if (candidates.length === 0) {
    console.log("\n  No eligible candidates (need a published product with a barcode that's");
    console.log("  missing an Amazon/Target offer). Nothing to do.\n");
    return;
  }

  const totalLookups = candidates.reduce((n, c) => n + c.queryRetailers.length, 0);
  const maxRecords = totalLookups * flags.rowsPerLookup;
  const estCost = maxRecords * flags.costPerRecord;
  const SAFETY = 1.5;
  const worstCaseCost = estCost * SAFETY;

  console.log(`\n  Candidate products: ${candidates.length} (cap --limit-products=${flags.limitProducts})`);
  console.log(`  UPC lookups:        ${totalLookups} (one per missing upc-capable retailer)`);
  console.log(`  Rows/lookup:        ${flags.rowsPerLookup}`);
  console.log(`  Max records:        ~${maxRecords}`);
  console.log(`  Cost/record:        $${flags.costPerRecord}`);
  console.log(`  ESTIMATED COST:     ~$${estCost.toFixed(2)} (worst case ~$${worstCaseCost.toFixed(2)})`);
  console.log(`  SPEND CAP:          $${flags.maxSpendUsd.toFixed(2)} (--max-spend)`);
  console.log(`\n  Sample candidates:`);
  for (const c of candidates.slice(0, 10)) {
    console.log(`    [${c.barcode}] have:${c.haveRetailers.join("+")} → query:${c.queryRetailers.join("+")}  ${c.title.slice(0, 60)}`);
  }

  if (worstCaseCost > flags.maxSpendUsd) {
    console.error(
      `\n!! ABORTED — worst-case cost ~$${worstCaseCost.toFixed(2)} exceeds the $${flags.maxSpendUsd.toFixed(2)} cap.\n` +
      `   Lower --limit-products or --rows-per-lookup, or raise --max-spend.\n`,
    );
    process.exit(1);
  }

  if (flags.dryRun) {
    console.log("\n--dry-run: no API calls made. Exiting.\n");
    return;
  }

  if (!flags.yes) {
    const ok = await confirm(`\nProceed with the LIVE paid UPC enrichment above? (y/N) `);
    if (!ok) {
      console.log("Aborted by user. No API calls made.\n");
      return;
    }
  }

  const before = await multiRetailerProductCount();
  console.log(`\n  Multi-retailer products BEFORE: ${before}`);

  // ── UPC lookups (concurrent pool) ─────────────────────────────────────────
  console.log(`\n=== Querying competitors by UPC (live Bright Data, concurrency ${flags.concurrency}) ===`);
  const tasks: { c: Candidate; retailer: SourcingRetailer }[] = [];
  for (const c of candidates) for (const r of c.queryRetailers) tasks.push({ c, retailer: r });

  let imported = 0;
  const failures: string[] = [];
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      const { c, retailer } = tasks[i];
      try {
        const res = await ingestRetailerProducts({
          retailer,
          query: c.barcode,
          operation: "upc_lookup",
          limit: flags.rowsPerLookup,
          timeoutMs: flags.timeoutMs,
        });
        imported += res.inserted;
        console.log(`  ✓ ${retailer.padEnd(7)} upc ${c.barcode} → ${res.inserted} rows  (${c.title.slice(0, 40)})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(`${retailer} ${c.barcode}: ${msg}`);
        console.error(`  ✗ ${retailer.padEnd(7)} upc ${c.barcode} → ${msg}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(flags.concurrency, tasks.length) }, () => worker()));
  console.log(`\n  Imported ${imported} new raw records. Failures: ${failures.length}.`);

  // ── UPC stamping (corroborated) ───────────────────────────────────────────
  // upc_lookup often returns the right product WITHOUT echoing the barcode. Since
  // we know the UPC we queried, stamp it onto a barcode-less row — but ONLY when
  // the row is strongly corroborated as the SAME item (brand + title + size,
  // never a bundle/kit/refill, never a conflicting barcode). Every decision is
  // logged. A row that already carries its own barcode is left untouched (the
  // normal catalog-build below handles it; a different barcode = different item).
  console.log(`\n=== UPC stamping (corroborated) ===`);
  const fresh = await prisma.rawProductRecord.findMany({
    where: {
      scrapedAt: { gte: runStart },
      processingStatus: { in: ["RAW", "CHECKED", "NEEDS_REVIEW", "STALE"] },
    },
    orderBy: { scrapedAt: "desc" },
  });
  let stamped = 0, stampRejected = 0;
  for (const rec of fresh) {
    const recListing = buildNormalizedListing(rec as never);
    const recBarcode =
      cleanBarcode(recListing.upc) ?? cleanBarcode(recListing.gtin) ?? cleanBarcode(recListing.ean);
    if (recBarcode) continue; // carries its own barcode → not a stamping candidate
    const retailerId = getRetailerConfigByName(rec.retailer)?.retailer;
    const cands = candidates.filter((c) => retailerId && c.queryRetailers.includes(retailerId));
    // Word overlap between the row title and a candidate title — used to pick the
    // CLOSEST candidate for a meaningful rejection reason (not an arbitrary one).
    const recWords = new Set((recListing.title ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
    const overlapWith = (c: Candidate) =>
      c.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && recWords.has(w)).length;
    let accepted: { c: Candidate; reasons: string[] } | null = null;
    let bestReject: { reasons: string[]; overlap: number } = {
      reasons: ["no queried candidate for this retailer"],
      overlap: -1,
    };
    for (const c of cands) {
      const r = corroborateUpcStamp(
        { brand: c.brand, title: c.title, sizeLabel: c.sizeLabel, barcode: c.barcode },
        { brand: recListing.brand, title: recListing.title, sizeLabel: recListing.sizeNormalized ?? recListing.size, barcode: null },
      );
      if (r.accept) { accepted = { c, reasons: r.reasons }; break; }
      // Report the rejection from the CLOSEST candidate (most shared title words)
      // so the log reads e.g. "brand mismatch scjohnson ≠ mrs meyers", not a
      // mismatch against some unrelated product we also happened to query.
      const ov = overlapWith(c);
      if (ov > bestReject.overlap) bestReject = { reasons: r.reasons, overlap: ov };
    }
    if (accepted) {
      await prisma.rawProductRecord.update({ where: { id: rec.id }, data: { upcGtin: accepted.c.barcode } });
      stamped++;
      console.log(`  ✓ STAMP ${accepted.c.barcode} → ${rec.retailer.padEnd(7)} "${(rec.title ?? "").slice(0, 44)}"  [${accepted.reasons.join("; ")}]`);
    } else {
      stampRejected++;
      console.log(`  ✗ keep-unlinked ${rec.retailer.padEnd(7)} "${(rec.title ?? "").slice(0, 44)}"  [${bestReject.reasons.join("; ")}]`);
    }
  }
  console.log(`  Stamped ${stamped} rows; rejected ${stampRejected}.`);

  // ── Catalog-build the new raw records (barcode key → idempotent merge) ─────
  console.log(`\n=== Publish: catalog build ===`);
  const pending = await prisma.rawProductRecord.findMany({
    where: {
      scrapedAt: { gte: runStart },
      processingStatus: { in: ["RAW", "CHECKED", "NEEDS_REVIEW", "STALE"] },
    },
    orderBy: { scrapedAt: "desc" },
  });
  let published = 0, skipped = 0;
  for (const rec of pending) {
    const listing = buildNormalizedListing(rec as never);
    const hasBarcode = Boolean(listing.upc || listing.gtin || listing.ean);
    // We only want barcode-anchored merges here — a record with no barcode can't
    // align on the `code:` identity, so skip it (avoids minting orphan products).
    if (!hasBarcode) { skipped++; continue; }
    const usable =
      Boolean(listing.title) && (listing.price ?? 0) > 0 &&
      Boolean(rec.imageUrl?.startsWith("http")) && Boolean(rec.productUrl?.startsWith("http"));
    const retailerId = getRetailerConfigByName(rec.retailer)?.retailer;
    if (!usable || !retailerId) { skipped++; continue; }
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        await publishTrustedCatalogRecord(
          { id: rec.id, productUrl: rec.productUrl, imageUrl: rec.imageUrl, price: rec.price, retailerId },
          listing,
        );
        ok = true;
      } catch (err) {
        if (attempt === 3) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  ✗ publish "${rec.title?.slice(0, 50)}": ${msg}`);
        } else {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
    if (ok) published++; else skipped++;
  }
  console.log(`  catalog-build: published ${published}, skipped ${skipped} (no barcode / missing fields)`);

  // ── Link by barcode across retailers ──────────────────────────────────────
  let linkResult: Awaited<ReturnType<typeof linkCrossRetailer>> | null = null;
  if (flags.link) {
    console.log(`\n=== Cross-retailer linking ===`);
    try {
      linkResult = await linkCrossRetailer({ apply: true, crossOnly: true });
      console.log(
        `  Linked ${linkResult.merged} clusters (${linkResult.crossRetailer} cross-retailer); ` +
        `moved ${linkResult.offersMoved} offers, retired ${linkResult.retired} duplicates.`,
      );
      for (const s of linkResult.samples.slice(0, 10)) console.log("    " + s);
      if (linkResult.errors.length) {
        console.log(`  Link errors (${linkResult.errors.length}):`);
        for (const e of linkResult.errors.slice(0, 5)) console.log("    ! " + e);
      }
    } catch (e) {
      console.warn("  Linking failed (records are intact; run scripts/link-cross-retailer.ts):", e);
    }
  }

  const after = await multiRetailerProductCount();

  console.log("\n=== Final summary ===");
  console.log(`  Candidate products queried:   ${candidates.length}`);
  console.log(`  UPC lookups run:              ${tasks.length} (failures ${failures.length})`);
  console.log(`  New raw records imported:     ${imported}`);
  console.log(`  UPC-stamped (corroborated):   ${stamped} (rejected ${stampRejected})`);
  console.log(`  Catalog-built (published):    ${published}`);
  console.log(`  Cross-retailer merges:        ${linkResult ? linkResult.crossRetailer : "n/a"}`);
  console.log(`  Multi-retailer products:      ${before} → ${after}  (Δ ${after - before >= 0 ? "+" : ""}${after - before})`);
  const actualCost = imported * flags.costPerRecord;
  console.log(`  Approx ACTUAL spend:          ~$${actualCost.toFixed(2)} (${imported} records × $${flags.costPerRecord})`);
  if (failures.length) {
    console.log(`\n  Failure detail:`);
    for (const f of failures) console.log(`    - ${f}`);
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error("\nenrich-by-upc failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
