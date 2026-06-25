/**
 * Cross-retailer product linking. Merges duplicate Products that are the SAME
 * item across retailers into one canonical Product carrying every retailer's
 * offer — so Compare shows Amazon / Walmart / Target / IKEA side-by-side.
 *
 * Matching tiers (canonical-grade → fuzzy):
 *   1. barcode (shared UPC/EAN/GTIN)         — exact, always merge
 *   2. brand + real manufacturer model       — exact, always merge
 *   3. brand + core title nouns              — fuzzy GROUP, then split by SIZE:
 *        products whose parsed sizes are BOTH present and DIFFERENT never merge
 *        (13 gallon ≠ 20 gallon); a missing size merges into the single size
 *        present; ≥2 distinct sizes ⇒ each size its own product, no-size stays
 *        standalone.
 *
 * Merge = keep one canonical product (most live offers, prefer one with a
 * barcode), move the other products' live PriceQuotes onto it (dedupe by
 * retailer+url), and retire the emptied duplicates (published=false). Idempotent.
 *
 *   npx tsx --conditions=react-server scripts/link-cross-retailer.ts            # dry run
 *   npx tsx --conditions=react-server scripts/link-cross-retailer.ts --apply    # execute
 */
import { loadEnv } from "./load-env.mjs";
loadEnv();

import { prisma } from "../src/lib/db/prisma";
import { parseSizes, parseSizeToken, coreTokens, type ProductIdentity } from "../src/lib/matching/cross-retailer-key";

const APPLY = process.argv.includes("--apply");
// Safety: by default only merge clusters that actually span 2+ retailers (the
// cross-retailer goal). Pass --include-same-retailer to also dedupe within a
// single retailer (larger, riskier — review first).
const CROSS_ONLY = !process.argv.includes("--include-same-retailer");
const norm = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Two products are size-compatible if every size dimension present in BOTH
 *  agrees within 40% (so "18 oz"≈"18.8 oz" but "Pack of 6"≠"Pack of 24" and
 *  "13 gal"≠"20 gal"). Dimensions present in only one side are ignored. */
function sizesCompatible(a: ProductIdentity, b: ProductIdentity): boolean {
  const sa = parseSizes(a);
  const sb = parseSizes(b);
  for (const unit of Object.keys(sa)) {
    if (sb[unit] === undefined) continue;
    const hi = Math.max(sa[unit], sb[unit]);
    const lo = Math.min(sa[unit], sb[unit]);
    if (lo <= 0 || hi / lo > 1.4) return false;
  }
  return true;
}

interface Row extends ProductIdentity {
  id: string;
  catalogId: string;
  liveOffers: { id: string; retailerId: string; productUrl: string }[];
}

/** Loose group key. Barcode is exact; everything else uses brand + core title
 *  nouns (NOT the model tier — our `mpn` is polluted with retailer SKUs like
 *  ASINs / Walmart item-ids that never match across retailers). Size is applied
 *  later via tolerant clustering. */
function groupKey(r: Row): string | null {
  // Brand + core title nouns for EVERYONE — we deliberately do NOT silo by
  // barcode, because retailers use different barcodes for the same item (so
  // barcode-keying splits Cheerios-Amazon from Cheerios-Walmart). Size is applied
  // via tolerant clustering next. Skip the model tier (mpn = retailer SKUs).
  const brand = norm(r.brandCanonical || r.brand);
  if (!brand) return null;
  const tokens = coreTokens(r);
  if (tokens.length < 2 && !parseSizeToken(r)) return null; // too thin to link safely
  return `grp:${brand}:${tokens.join("-")}`;
}

/** Partition a fuzzy group into merge-clusters by multi-signal size
 *  compatibility. A product joins a cluster only if it's size-compatible with
 *  EVERY member (compatibility isn't transitive, so we check all). */
function clusterBySize(rows: Row[]): Row[][] {
  const clusters: Row[][] = [];
  for (const r of rows) {
    const c = clusters.find((cl) => cl.every((m) => sizesCompatible(r, m)));
    if (c) c.push(r);
    else clusters.push([r]);
  }
  return clusters;
}

function pickCanonical(rows: Row[]): Row {
  return [...rows].sort((a, b) => {
    const ab = a.upc || a.gtin || a.ean ? 1 : 0;
    const bb = b.upc || b.gtin || b.ean ? 1 : 0;
    if (ab !== bb) return bb - ab; // prefer a product with a barcode
    return b.liveOffers.length - a.liveOffers.length; // then most offers
  })[0];
}

async function main() {
  console.log(`Cross-retailer linking — ${APPLY ? "APPLY (will merge)" : "DRY RUN (no changes)"}\n`);
  const products = await prisma.product.findMany({
    where: { published: true },
    select: {
      id: true, catalogId: true, title: true, brand: true, brandCanonical: true,
      upc: true, gtin: true, mpn: true, sizeLabel: true,
      priceQuotes: {
        where: { expiresAt: { gt: new Date() } },
        select: { id: true, retailerId: true, productUrl: true },
      },
    },
    take: 40000,
  });
  const rows: Row[] = products
    .map((p) => ({ ...p, liveOffers: p.priceQuotes }))
    .filter((r) => r.liveOffers.length > 0);
  console.log(`Loaded ${rows.length} published products with live offers.`);

  // Group by loose key.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = groupKey(r);
    if (!k) continue;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }

  // DIAGNOSTIC: how many loose groups span 2+ retailers before size-splitting?
  let looseCross = 0;
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    if (new Set(members.flatMap((r) => r.liveOffers.map((o) => o.retailerId))).size >= 2) looseCross++;
  }
  console.log(`(diagnostic) loose groups spanning 2+ retailers: ${looseCross}`);

  // Build merge clusters (size-aware for fuzzy groups).
  const clusters: Row[][] = [];
  for (const [k, members] of groups) {
    if (members.length < 2) continue;
    if (k.startsWith("grp:")) clusters.push(...clusterBySize(members).filter((c) => c.length >= 2));
    else clusters.push(members); // barcode/model exact
  }

  let merged = 0;
  let offersMoved = 0;
  let retired = 0;
  let crossRetailer = 0;
  const samples: string[] = [];

  for (const cluster of clusters) {
    const canonical = pickCanonical(cluster);
    const others = cluster.filter((r) => r.id !== canonical.id);
    if (!others.length) continue;
    const retailers = new Set(cluster.flatMap((r) => r.liveOffers.map((o) => o.retailerId)));
    if (CROSS_ONLY && retailers.size < 2) continue; // safety: cross-retailer only
    if (retailers.size >= 2) crossRetailer++;
    merged++;
    if (samples.length < 12 && retailers.size >= 2) {
      samples.push(`[${[...retailers].join(",")}] ${canonical.brand} ${(canonical.title || "").slice(0, 44)}`);
    }

    if (APPLY) {
      const existing = new Set(canonical.liveOffers.map((o) => `${o.retailerId}|${o.productUrl}`));
      for (const other of others) {
        for (const o of other.liveOffers) {
          const sig = `${o.retailerId}|${o.productUrl}`;
          if (existing.has(sig)) continue; // dedupe identical offer
          await prisma.priceQuote.update({ where: { id: o.id }, data: { productId: canonical.id } }).catch(() => {});
          existing.add(sig);
          offersMoved++;
        }
        // Retire the now-empty duplicate so it doesn't show as a separate product.
        await prisma.product.update({ where: { id: other.id }, data: { published: false } }).catch(() => {});
        retired++;
      }
    } else {
      offersMoved += others.reduce((n, r) => n + r.liveOffers.length, 0);
      retired += others.length;
    }
  }

  console.log(`\nClusters to merge: ${merged} (${crossRetailer} span 2+ retailers)`);
  console.log(`Offers ${APPLY ? "moved" : "to move"}: ${offersMoved} · products ${APPLY ? "retired" : "to retire"}: ${retired}`);
  console.log(`\nSample cross-retailer merges:`);
  for (const s of samples) console.log("  " + s);
  if (!APPLY) console.log(`\n(Dry run — re-run with --apply to execute.)`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error("link-cross-retailer failed:", e); process.exit(1); });
