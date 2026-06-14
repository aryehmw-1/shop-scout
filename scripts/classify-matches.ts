/**
 * Offline match classifier — builds the admin review queue without slowing live
 * search. Samples published products, compares same-brand / same-category pairs
 * with the deterministic classifier, and stores non-DIFFERENT decisions.
 *
 *   npx tsx --conditions=react-server scripts/classify-matches.ts --limit=600
 */
import { loadEnv } from "./load-env.mjs";
loadEnv();

import { prisma } from "../src/lib/db/prisma";
import { buildNormalizedListing } from "../src/lib/pipeline/build-listing";
import { classifyAndRecord } from "../src/lib/matching/record";

const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 600);
const MAX_PAIRS_PER_GROUP = 40;

async function main() {
  const products = await prisma.product.findMany({
    where: { published: true, validationStatus: "approved" },
    take: limit,
    orderBy: { createdAt: "desc" },
    select: { id: true, catalogId: true, title: true, brand: true, category: true, upc: true, gtin: true, mpn: true, sizeLabel: true },
  });
  console.log(`Classifying within ${products.length} products…`);

  const listings = products.map((p) => ({
    id: p.id,
    listing: buildNormalizedListing({
      retailer: "catalog", title: p.title, brand: p.brand, upcGtin: p.upc, gtin: p.gtin,
      modelNumber: p.mpn, size: p.sizeLabel, category: p.category, price: 1,
    }),
  }));

  // Group by normalized brand — within a brand, title-overlap surfaces variants
  // (e.g. two Dial hand soaps) as SIMILAR and same-barcode dups as EXACT.
  const byBrand = new Map<string, typeof listings>();
  for (const l of listings) {
    const k = l.listing.brandNormalized || "_";
    (byBrand.get(k) ?? byBrand.set(k, []).get(k)!).push(l);
  }

  let pairs = 0, exact = 0, similar = 0;
  for (const group of byBrand.values()) {
    if (group.length < 2) continue;
    let made = 0;
    for (let i = 0; i < group.length && made < MAX_PAIRS_PER_GROUP; i++) {
      for (let j = i + 1; j < group.length && made < MAX_PAIRS_PER_GROUP; j++) {
        const r = await classifyAndRecord(group[i].listing, group[j].listing, {
          idA: group[i].id, idB: group[j].id,
        });
        pairs++; made++;
        if (r.decision === "EXACT_MATCH") exact++;
        else if (r.decision === "SIMILAR_ALTERNATIVE") similar++;
      }
    }
  }

  const stored = await prisma.productMatchDecision.count();
  console.log(`Compared ${pairs} pairs → EXACT ${exact}, SIMILAR ${similar}. Stored decisions: ${stored}.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error("classify-matches failed:", e); process.exit(1); });
