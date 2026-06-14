/**
 * Recover ALL rows from Bright Data snapshots we ALREADY PAID FOR.
 *
 * Re-downloading a finished snapshot does NOT re-scrape and does NOT bill again —
 * so this pulls back the thousands of records that earlier runs discarded (the
 * old post-download slice kept only ~15-20 of each ~300-row crawl), maps them,
 * inserts them as RAW (deduped by productUrl), and catalog-publishes the clean
 * ones so they appear on the site. Zero additional API cost.
 *
 *   npx tsx --conditions=react-server scripts/recover-snapshots.ts
 *   npx tsx --conditions=react-server scripts/recover-snapshots.ts --retailers=walmart
 *   npx tsx --conditions=react-server scripts/recover-snapshots.ts --no-publish
 */
import { loadEnv } from "./load-env.mjs";
loadEnv();

import { prisma } from "../src/lib/db/prisma";
import { mapBrightDataRow } from "../src/lib/pipeline/ingestion/normalize-row";
import {
  getRetailerConfig,
  getRetailerConfigByName,
  brightDataDatasetIdFor,
} from "../src/lib/pipeline/ingestion/retailer-config";
import { buildNormalizedListing } from "../src/lib/pipeline/build-listing";
import { publishTrustedCatalogRecord } from "../src/lib/pipeline/canonical";
import type { SourcingRetailer } from "../src/lib/pipeline/sourcing/retailer-strategy";

const BASE = "https://api.brightdata.com/datasets/v3";
const KEY = process.env.BRIGHT_DATA_API_KEY!;
const headers = { Authorization: `Bearer ${KEY}` };

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const val = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const retailers = (val("retailers")?.split(",") ?? ["amazon", "walmart"]) as SourcingRetailer[];
const doPublish = !flag("no-publish");

async function listReadySnapshots(datasetId: string): Promise<string[]> {
  const res = await fetch(`${BASE}/snapshots?dataset_id=${datasetId}&status=ready`, { headers });
  if (!res.ok) throw new Error(`list snapshots ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as unknown;
  const list = Array.isArray(data) ? data : ((data as { snapshots?: unknown[] })?.snapshots ?? []);
  return (list as Record<string, unknown>[])
    .map((s) => String(s.id ?? s.snapshot_id ?? ""))
    .filter(Boolean);
}

async function downloadSnapshot(snapshotId: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${BASE}/snapshot/${snapshotId}?format=json`, { headers });
  if (!res.ok) throw new Error(`download ${snapshotId} ${res.status}`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

/** Stable per-listing retailer id (ASIN / Walmart item id / Target TCIN). */
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
  console.log(`=== Snapshot recovery (no re-scrape, no new cost) ===`);
  console.log(`Retailers: ${retailers.join(", ")} · publish: ${doPublish}\n`);

  let totalInserted = 0;

  for (const retailer of retailers) {
    const config = getRetailerConfig(retailer);
    const datasetId = brightDataDatasetIdFor(config);
    if (!datasetId) { console.log(`${retailer}: no dataset id, skipping`); continue; }

    const snapshots = await listReadySnapshots(datasetId);
    console.log(`${config.name}: ${snapshots.length} ready snapshots`);

    // Existing productUrls for this retailer → in-memory dedupe set.
    const existing = await prisma.rawProductRecord.findMany({
      where: { retailer: config.name },
      select: { productUrl: true },
    });
    const seen = new Set(existing.map((e) => e.productUrl).filter(Boolean) as string[]);

    let inserted = 0;
    let downloaded = 0;
    for (const sid of snapshots) {
      let rows: Record<string, unknown>[];
      try {
        rows = await downloadSnapshot(sid);
      } catch (e) {
        console.error(`  ✗ ${sid}: ${(e as Error).message}`);
        continue;
      }
      downloaded += rows.length;
      const fresh = rows
        .map((r) => mapBrightDataRow(r, config))
        .filter((m) => m.productUrl && !seen.has(m.productUrl));
      for (const m of fresh) seen.add(m.productUrl!);
      if (fresh.length) {
        const res = await prisma.rawProductRecord.createMany({ data: fresh });
        inserted += res.count;
      }
      console.log(`  ${sid}: ${rows.length} rows → +${fresh.length} new`);
    }
    console.log(`  ${config.name}: downloaded ${downloaded}, inserted ${inserted} NEW raw records.\n`);
    totalInserted += inserted;
  }

  // ── Catalog-publish all pending records for these retailers ────────────────
  let published = 0, skipped = 0;
  if (doPublish) {
    console.log(`=== Catalog publish ===`);
    const names = retailers.map((r) => getRetailerConfigByName(r)?.name ?? r);
    const pending = await prisma.rawProductRecord.findMany({
      where: { retailer: { in: names }, processingStatus: { in: ["RAW", "CHECKED", "NEEDS_REVIEW", "STALE"] } },
    });
    console.log(`Processing ${pending.length} pending records…`);
    for (const rec of pending) {
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
      if (!hasIdentity || !usable || !retailerId) { skipped++; continue; }
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        try {
          await publishTrustedCatalogRecord(
            { id: rec.id, productUrl: rec.productUrl, imageUrl: rec.imageUrl, price: rec.price, retailerId },
            listing,
          );
          ok = true;
        } catch (e) {
          if (attempt === 3) console.error(`  ✗ ${rec.title?.slice(0, 40)}: ${(e as Error).message}`);
          else await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
      if (ok) published++; else skipped++;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const totals = await prisma.rawProductRecord.groupBy({ by: ["retailer", "processingStatus"], _count: { _all: true } });
  console.log(`\n=== Result ===`);
  console.log(`Recovered (new raw records): ${totalInserted}`);
  console.log(`Published: ${published} · skipped: ${skipped}`);
  console.log(`DB rows by retailer/status:`);
  for (const t of totals) console.log(`  ${t.retailer} ${t.processingStatus}: ${t._count._all}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error("recovery failed:", e); process.exit(1); });
