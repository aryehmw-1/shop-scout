/**
 * UPC-anchored cross-retailer matching (Fix A) — SCAFFOLDING.
 *
 * GOAL: merge the SAME product across retailers into ONE canonical product (so
 * Compare shows Amazon + Walmart + Target prices side by side). The merge key is a
 * shared barcode (`duplicateGroupKey` → `code:<gtin14>`); we never merge on text.
 *
 * DATA FINDING (verified live 2026-06-19, do NOT re-discover the hard way):
 *   - TARGET scrape DOES return a clean `upc` (+ `upc_normalization`) → Target
 *     products are correctly keyed `code:<gtin14>` (8/8 sampled).
 *   - AMAZON scrape returns ASIN + `model_number` only — NO upc/gtin. (A few
 *     model_numbers happen to be UPC-shaped, e.g. ARM&HAMMER 033200941729, but most
 *     are model codes like 9889/80C — unreliable.)
 *   - WALMART scrape returns NO barcode at all, and its dataset has NO upc_lookup op.
 *   ⇒ With current datasets, only Target carries barcodes, so NOTHING merges across
 *     retailers. Batch 1 produced 0 multi-retailer products for exactly this reason.
 *
 * VIABLE PATH (needs the UPC-STAMP step below before it can merge):
 *   1. Anchor on TARGET products that HAVE a upc (this script reads them).
 *   2. Run Bright Data `upc_lookup` on retailers whose dataset supports
 *      discover_by=upc — AMAZON does; Walmart does NOT.
 *   3. **STAMP** the queried UPC onto the returned rows. The Amazon scrape won't
 *      include the barcode even when found BY barcode, so without stamping the
 *      Amazon product keys as `model:asin` and won't merge. Because WE supplied the
 *      UPC as the query, we can attach it with confidence. (TODO: implement the
 *      stamp — set rawJson.upcGtin on the inserted records, or add a queryUpc field
 *      that buildNormalizedListing prefers. Until then this script only ingests and
 *      will NOT merge.)
 *   4. Publish via the existing path → `createCanonicalProduct` reuses the Target
 *      product by `code:<gtin14>` and attaches the Amazon offer.
 *
 * Run plan once stamping lands (tiny canary):
 *   npx tsx --conditions=react-server scripts/cross-retailer-match.ts --retailers=amazon --max-upcs=10 --yes
 *   npx tsx --conditions=react-server scripts/import-common-products.ts --no-ingest --retailers=amazon
 *
 * Flags:
 *   --retailers=amazon            upc_lookup retailers (Amazon supports it; Walmart does not)
 *   --max-upcs=15                 Cap how many Target UPCs to look up (cost guard)
 *   --since-min=180               Only Target products imported in the last N min
 *   --limit=3                     limit_per_input per UPC lookup
 *   --cost-per-record=0.0015      For the estimate
 *   --max-spend=10                Hard $ cap (aborts before exceeding)
 *   --dry-run                     Plan + cost only; NO API calls
 *   --yes                         Skip confirmation
 */
import { loadEnv } from "./load-env.mjs";
loadEnv();

import { prisma } from "../src/lib/db/prisma";
import { ingestRetailerProducts } from "../src/lib/pipeline/ingest";
import { getRetailerConfigByName } from "../src/lib/pipeline/ingestion/retailer-config";
import type { SourcingRetailer } from "../src/lib/pipeline/sourcing/retailer-strategy";

function flag(name: string, def?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const RETAILERS = (flag("retailers", "amazon") ?? "amazon").split(",").map((s) => s.trim()) as SourcingRetailer[];
const MAX_UPCS = Number(flag("max-upcs", "15"));
const SINCE_MIN = Number(flag("since-min", "180"));
const LIMIT = Number(flag("limit", "3"));
const COST = Number(flag("cost-per-record", "0.0015"));
const MAX_SPEND = Number(flag("max-spend", "10"));
const DRY = has("dry-run");
const YES = has("yes");

async function main() {
  const since = new Date(Date.now() - SINCE_MIN * 60_000);
  // Anchor on products that ALREADY carry a real barcode (Target, today) — these
  // are the only reliable cross-retailer keys we have.
  const barcoded = await prisma.product.findMany({
    where: { createdAt: { gte: since }, upc: { not: null } },
    select: { upc: true, title: true },
    take: 500,
    orderBy: { createdAt: "desc" },
  });
  const seen = new Set<string>();
  const upcs: { upc: string; title: string }[] = [];
  for (const p of barcoded) {
    // Some Target rows pack several space-separated UPCs — anchor on the FIRST,
    // so the stamp produces a single clean code:<gtin14> key.
    const first = (p.upc ?? "").trim().split(/\s+/)[0] ?? "";
    const digits = first.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 14 || seen.has(digits)) continue;
    seen.add(digits);
    upcs.push({ upc: first, title: p.title });
    if (upcs.length >= MAX_UPCS) break;
  }

  const lookups = upcs.length * RETAILERS.length;
  const maxRecords = lookups * LIMIT;
  const estCost = maxRecords * COST;

  console.log("=== Cross-retailer UPC-lookup plan ===");
  console.log(`  Anchor barcodes (recent products w/ a upc): ${seen.size}${upcs.length < seen.size ? ` (capped to ${MAX_UPCS})` : ""}`);
  console.log(`  UPC-lookup retailers: ${RETAILERS.join(", ")}`);
  console.log(`  Lookups: ${lookups} | max records: ~${maxRecords} | est cost: ~$${estCost.toFixed(2)}`);
  console.log(`  SPEND CAP: $${MAX_SPEND.toFixed(2)}`);
  console.log("  UPC-STAMP active: the queried upc is written onto the looked-up rows");
  console.log("  (upcGtin) so they key as code:<gtin14> and MERGE with the anchor product.");
  if (estCost > MAX_SPEND) { console.error("  ABORT: estimate exceeds --max-spend."); process.exit(1); }
  if (!upcs.length) { console.log("  No recent barcoded products found — import Target first."); process.exit(0); }
  if (DRY) { console.log("\n--dry-run: no API calls made. Exiting."); process.exit(0); }
  if (!YES) { console.error("  Re-run with --yes to execute (paid)."); process.exit(1); }

  let spent = 0, ok = 0, miss = 0, fail = 0, stamped = 0, consecErr = 0;
  console.log("\n=== Looking up barcodes (live Bright Data) + UPC-STAMP ===");
  for (const { upc, title } of upcs) {
    for (const retailer of RETAILERS) {
      if (spent + LIMIT * COST > MAX_SPEND) { console.error("  !! spend cap reached — stopping."); await done(ok, miss, fail, spent, stamped); return; }
      try {
        const t0 = new Date(Date.now() - 5_000); // small skew guard
        const res = await ingestRetailerProducts({ retailer, query: upc, operation: "upc_lookup", limit: LIMIT });
        spent += (res.inserted || LIMIT) * COST;
        if (res.inserted > 0) {
          ok++;
          // UPC-STAMP: the looked-up retailer's scrape omits the barcode, so stamp
          // the QUERIED upc onto the new RAW rows (we searched by it → high
          // confidence). buildNormalizedListing reads upcGtin → duplicateGroupKey
          // becomes code:<gtin14> → it merges with the Target product at publish.
          const retailerName = getRetailerConfigByName(retailer)?.name ?? retailer;
          const upd = await prisma.rawProductRecord.updateMany({
            where: { retailer: retailerName, scrapedAt: { gte: t0 }, OR: [{ upcGtin: null }, { upcGtin: "" }] },
            data: { upcGtin: upc },
          });
          stamped += upd.count;
          console.log(`  ✓ ${retailer} ${upc} → ${res.inserted} row(s), stamped ${upd.count}  [${title.slice(0, 30)}]`);
        }
        else { miss++; console.log(`  · ${retailer} ${upc} → no match`); }
        consecErr = 0;
      } catch (err) {
        fail++; consecErr++;
        console.error(`  ✗ ${retailer} ${upc} → ${err instanceof Error ? err.message : String(err)}`);
        if (consecErr >= 3) { console.error("  !! 3 errors in a row — aborting."); break; }
      }
    }
    if (consecErr >= 3) break;
  }
  await done(ok, miss, fail, spent, stamped);
}

async function done(ok: number, miss: number, fail: number, spent = 0, stamped = 0) {
  console.log("\n=== Ingest summary ===");
  console.log(`  matched (rows found): ${ok} | no-match: ${miss} | failed: ${fail} | upc-stamped rows: ${stamped} | ~$${spent.toFixed(2)} spent`);
  console.log("  Next: publish + merge with");
  console.log(`    npx tsx --conditions=react-server scripts/import-common-products.ts --no-ingest --retailers=${RETAILERS.join(",")}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
