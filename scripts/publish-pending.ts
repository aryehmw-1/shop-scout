/**
 * Resilient catalog publisher for already-ingested rows. Publishes pending
 * RawProductRecords (RAW/CHECKED/NEEDS_REVIEW/STALE) in small batches, re-querying
 * each batch so a transient Neon disconnect only costs one record (not the whole
 * run). Zero Bright Data cost — pure DB.
 *
 *   npx tsx --conditions=react-server scripts/publish-pending.ts --retailers=walmart
 *
 * Flags:
 *   --retailers=walmart,amazon   (default: walmart)
 *   --batch=200                  rows per query (default 200)
 */
import { loadEnv } from "./load-env.mjs";
loadEnv();

import { prisma } from "../src/lib/db/prisma";
import { buildNormalizedListing } from "../src/lib/pipeline/build-listing";
import { publishTrustedCatalogRecord } from "../src/lib/pipeline/canonical";
import { getRetailerConfigByName } from "../src/lib/pipeline/ingestion/retailer-config";

const argv = process.argv.slice(2);
const val = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const retailers = (val("retailers") ?? "walmart").split(",").map((s) => s.trim());
const batchSize = Number(val("batch") ?? 200);

const names = retailers.map((r) => getRetailerConfigByName(r)?.name ?? r);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run a DB query with retry — Neon closes connections under load; Prisma
 *  reconnects on the next attempt, so a short backoff drains the whole set in
 *  one process instead of crashing. */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 8) throw e;
      console.error(`  (${label} retry ${attempt}: ${(e as Error).message.slice(0, 60)})`);
      await sleep(1000 * attempt);
    }
  }
}

function retailerItemId(rec: { rawJson?: string | null; productUrl?: string | null }): string | null {
  try {
    const j = JSON.parse(rec.rawJson || "{}") as Record<string, unknown>;
    for (const k of ["asin", "item_id", "product_id", "tcin", "sku", "gtin"]) {
      const v = j[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  } catch { /* ignore */ }
  const m = (rec.productUrl || "").match(/\/(?:dp|gp\/product|ip|p)\/(?:[^/]*-)?([A-Z0-9]{8,14})/i);
  return m ? m[1] : null;
}

async function main() {
  console.log(`Publishing pending records for: ${names.join(", ")} (batch ${batchSize})`);
  let published = 0, setAside = 0, errors = 0;

  for (let loop = 1; ; loop++) {
    const batch = await withRetry(
      () =>
        prisma.rawProductRecord.findMany({
          where: { retailer: { in: names }, processingStatus: { in: ["RAW", "CHECKED", "STALE"] } },
          take: batchSize,
          orderBy: { scrapedAt: "asc" },
        }),
      "fetch batch",
    );
    if (!batch.length) break;

    for (const rec of batch) {
      const listing = buildNormalizedListing(rec as never);
      const hasBarcode = Boolean(listing.upc || listing.gtin || listing.ean);
      const hasModel = Boolean(listing.brandNormalized && listing.modelNumberNormalized);
      if (!hasBarcode && !hasModel) {
        const itemId = retailerItemId(rec);
        if (itemId && listing.brandNormalized) {
          listing.modelNumber = itemId;
          listing.modelNumberNormalized = itemId.toLowerCase();
        }
      }
      const hasIdentity = hasBarcode || Boolean(listing.brandNormalized && listing.modelNumberNormalized);
      const usable =
        Boolean(listing.title) && (listing.price ?? 0) > 0 &&
        Boolean(rec.imageUrl?.startsWith("http")) && Boolean(rec.productUrl?.startsWith("http"));
      const retailerId = getRetailerConfigByName(rec.retailer)?.retailer;

      // Unpublishable → move out of the RAW set so we don't loop on it forever.
      if (!hasIdentity || !usable || !retailerId) {
        await prisma.rawProductRecord.update({ where: { id: rec.id }, data: { processingStatus: "NEEDS_REVIEW" } }).catch(() => {});
        setAside++;
        continue;
      }

      let ok = false;
      for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
        try {
          await publishTrustedCatalogRecord(
            { id: rec.id, productUrl: rec.productUrl, imageUrl: rec.imageUrl, price: rec.price, retailerId },
            listing,
          );
          ok = true;
        } catch {
          await new Promise((r) => setTimeout(r, 400 * attempt)); // backoff + let Prisma reconnect
        }
      }
      if (ok) published++;
      else errors++; // leave as RAW → retried in a later batch
      await sleep(10); // gentle pacing so Neon isn't overwhelmed
    }

    const remaining = await withRetry(
      () =>
        prisma.rawProductRecord.count({
          where: { retailer: { in: names }, processingStatus: { in: ["RAW", "CHECKED", "STALE"] } },
        }),
      "count",
    );
    console.log(`  loop ${loop}: published ${published}, set-aside ${setAside}, transient-errors ${errors} · remaining ${remaining}`);
    // Safety valve: if a whole batch made no progress (all errored AND none
    // set-aside), stop to avoid an infinite loop on a dead connection.
    if (remaining > 0 && batch.length > 0 && published === 0 && setAside === 0) {
      console.error("  no progress this run — stopping; re-run to continue.");
      break;
    }
  }

  console.log(`\nDone. published ${published}, set-aside ${setAside}, transient errors ${errors}.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error("publish-pending failed:", e); process.exit(1); });
