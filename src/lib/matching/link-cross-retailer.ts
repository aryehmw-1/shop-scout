// Cross-retailer product LINKING (reusable core). Merges duplicate Products that
// are the SAME item across retailers into one canonical Product carrying every
// retailer's offer — so Compare shows Amazon / Walmart / Target / IKEA side-by-side.
//
// This is the shared engine behind both the CLI (`scripts/link-cross-retailer.ts`)
// and the automatic post-import hook in `scripts/import-common-products.ts`. It is
// idempotent: re-running after the merges are applied finds nothing new to do.
//
// Matching tiers (canonical-grade → fuzzy):
//   1. barcode (shared UPC/EAN/GTIN)         — exact, always merge
//   2. brand + real manufacturer model       — exact, always merge
//   3. brand + core title nouns              — fuzzy GROUP, then split by SIZE:
//        products whose parsed sizes are BOTH present and DIFFERENT never merge
//        (13 gallon ≠ 20 gallon); a missing size merges into the single size
//        present; ≥2 distinct sizes ⇒ each size its own product.
//
// Merge = keep one canonical product (most live offers, prefer one with a
// barcode), move the other products' live PriceQuotes onto it (dedupe by
// retailer+url), and retire the emptied duplicates (published=false).

import { prisma } from "../db/prisma";
import { parseSizes, parseSizeToken, coreTokens, type ProductIdentity } from "./cross-retailer-key";

const norm = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const errMsg = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return m.split("\n").join(" ").slice(0, 200);
};

/** Two products are size-compatible when we can affirmatively confirm they're the
 *  same size:
 *   - Every shared size dimension must agree within 40% ("18 oz"≈"18.8 oz" but
 *     "Pack of 6"≠"Pack of 24" and "13 gal"≠"20 gal").
 *   - If BOTH sides carry size signals but share NO comparable unit (e.g. "110
 *     loads" vs "24 ct"), we CANNOT confirm they match → not compatible. This
 *     keeps the auto-applied linker conservative: a missed merge just leaves a
 *     duplicate (status quo), whereas a wrong merge shows the wrong price/retailer.
 *   - A product with no parsed size stays mergeable (the brand+tokens carry it). */
function sizesCompatible(a: ProductIdentity, b: ProductIdentity): boolean {
  const sa = parseSizes(a);
  const sb = parseSizes(b);
  const unitsA = Object.keys(sa);
  const unitsB = Object.keys(sb);
  let shared = 0;
  for (const unit of unitsA) {
    if (sb[unit] === undefined) continue;
    shared++;
    const hi = Math.max(sa[unit], sb[unit]);
    const lo = Math.min(sa[unit], sb[unit]);
    if (lo <= 0 || hi / lo > 1.4) return false;
  }
  // Both sized, but no overlapping dimension to compare → can't confirm → skip.
  if (unitsA.length > 0 && unitsB.length > 0 && shared === 0) return false;
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
 *  later via tolerant clustering. We deliberately do NOT silo by barcode, because
 *  retailers use different barcodes for the same item. */
function groupKey(r: Row): string | null {
  const brand = norm(r.brandCanonical || r.brand);
  if (!brand) return null;
  const tokens = coreTokens(r);
  if (tokens.length < 2 && !parseSizeToken(r)) return null; // too thin to link safely
  return `grp:${brand}:${tokens.join("-")}`;
}

/** Partition a fuzzy group into merge-clusters by multi-signal size
 *  compatibility. ANCHOR-based: size-compatibility isn't transitive, so we anchor
 *  each cluster on its highest-offer product (which also becomes the canonical)
 *  and absorb every remaining product compatible with THAT anchor. This converges
 *  in a single pass — a greedy "compatible with every member" rule would leave
 *  non-transitive chains to dribble in over many re-runs. */
function clusterBySize(rows: Row[]): Row[][] {
  const pool = [...rows].sort((a, b) => b.liveOffers.length - a.liveOffers.length);
  const claimed = new Set<string>();
  const clusters: Row[][] = [];
  for (const anchor of pool) {
    if (claimed.has(anchor.id)) continue;
    claimed.add(anchor.id);
    const cluster = [anchor];
    for (const r of pool) {
      if (claimed.has(r.id)) continue;
      if (sizesCompatible(anchor, r)) { claimed.add(r.id); cluster.push(r); }
    }
    clusters.push(cluster);
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

export interface LinkOptions {
  /** Execute the merges. When false (default) it's a dry run — no DB writes. */
  apply?: boolean;
  /** Only merge clusters that span 2+ retailers (the cross-retailer goal). When
   *  false, also dedupe within a single retailer (larger, riskier). Default true. */
  crossOnly?: boolean;
  /** Per-cluster sample lines for the report (default 12). */
  maxSamples?: number;
  /** Emit progress to console (the CLI sets this; the import hook leaves it off
   *  and prints its own one-liner). Default false. */
  log?: boolean;
}

export interface LinkResult {
  /** Published products with at least one live offer that were considered. */
  considered: number;
  /** Loose groups spanning 2+ retailers before size-splitting (diagnostic). */
  looseCrossGroups: number;
  /** Clusters merged (or that would merge in a dry run). */
  merged: number;
  /** Of those, how many span 2+ retailers. */
  crossRetailer: number;
  /** Offers moved onto canonicals (or that would move). */
  offersMoved: number;
  /** Duplicate products retired / to retire. */
  retired: number;
  /** Human-readable cross-retailer merge samples. */
  samples: string[];
  /** Per-write failures (truncated). Empty on a clean run. */
  errors: string[];
}

/**
 * Find and (optionally) apply cross-retailer merges. Pure data operation —
 * safe to call from a script or after an import. Idempotent.
 */
export async function linkCrossRetailer(opts: LinkOptions = {}): Promise<LinkResult> {
  const apply = opts.apply ?? false;
  const crossOnly = opts.crossOnly ?? true;
  const maxSamples = opts.maxSamples ?? 12;
  const log = opts.log ?? false;
  const say = (m: string) => { if (log) console.log(m); };

  say(`Cross-retailer linking — ${apply ? "APPLY (will merge)" : "DRY RUN (no changes)"}\n`);

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
  say(`Loaded ${rows.length} published products with live offers.`);

  // Group by loose key.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = groupKey(r);
    if (!k) continue;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }

  // Diagnostic: how many loose groups span 2+ retailers before size-splitting?
  let looseCrossGroups = 0;
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    if (new Set(members.flatMap((r) => r.liveOffers.map((o) => o.retailerId))).size >= 2) looseCrossGroups++;
  }
  say(`(diagnostic) loose groups spanning 2+ retailers: ${looseCrossGroups}`);

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
  const errors: string[] = [];

  for (const cluster of clusters) {
    const canonical = pickCanonical(cluster);
    const others = cluster.filter((r) => r.id !== canonical.id);
    if (!others.length) continue;
    const retailers = new Set(cluster.flatMap((r) => r.liveOffers.map((o) => o.retailerId)));
    if (crossOnly && retailers.size < 2) continue; // safety: cross-retailer only
    if (retailers.size >= 2) crossRetailer++;
    merged++;
    if (samples.length < maxSamples && retailers.size >= 2) {
      samples.push(`[${[...retailers].join(",")}] ${canonical.brand} ${(canonical.title || "").slice(0, 44)}`);
    }

    if (apply) {
      const existing = new Set(canonical.liveOffers.map((o) => `${o.retailerId}|${o.productUrl}`));
      for (const other of others) {
        // Move each unique offer; if any move fails we do NOT retire the source
        // (its offer would be orphaned), so the run stays consistent & idempotent.
        let moveFailed = false;
        for (const o of other.liveOffers) {
          const sig = `${o.retailerId}|${o.productUrl}`;
          if (existing.has(sig)) {
            // Exact duplicate offer already on the canonical — retire this dangling
            // one so it can't keep the source product alive across re-runs.
            try { await prisma.priceQuote.delete({ where: { id: o.id } }); }
            catch (e) { moveFailed = true; errors.push(`delete dup offer ${o.id}: ${errMsg(e)}`); }
            continue;
          }
          try {
            await prisma.priceQuote.update({ where: { id: o.id }, data: { productId: canonical.id } });
            existing.add(sig);
            offersMoved++;
          } catch (e) {
            moveFailed = true;
            errors.push(`move offer ${o.id} → ${canonical.id}: ${errMsg(e)}`);
          }
        }
        if (moveFailed) continue; // leave the source published; retry next run
        // Retire the now-empty duplicate so it doesn't show as a separate product.
        try {
          await prisma.product.update({ where: { id: other.id }, data: { published: false } });
          retired++;
        } catch (e) {
          errors.push(`retire product ${other.id}: ${errMsg(e)}`);
        }
      }
    } else {
      offersMoved += others.reduce((n, r) => n + r.liveOffers.length, 0);
      retired += others.length;
    }
  }

  if (log) {
    say(`\nClusters to merge: ${merged} (${crossRetailer} span 2+ retailers)`);
    say(`Offers ${apply ? "moved" : "to move"}: ${offersMoved} · products ${apply ? "retired" : "to retire"}: ${retired}`);
    if (samples.length) {
      say(`\nSample cross-retailer merges:`);
      for (const s of samples) say("  " + s);
    }
    if (!apply) say(`\n(Dry run — re-run with --apply to execute.)`);
    if (errors.length) {
      say(`\n⚠ ${errors.length} write error(s):`);
      for (const e of errors.slice(0, 10)) say("  " + e);
    }
  }

  return { considered: rows.length, looseCrossGroups, merged, crossRetailer, offersMoved, retired, samples, errors };
}
