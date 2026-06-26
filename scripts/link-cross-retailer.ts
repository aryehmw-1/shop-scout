/**
 * Cross-retailer product linking — CLI wrapper. The actual engine lives in
 * `src/lib/matching/link-cross-retailer.ts` (shared with the automatic
 * post-import hook in scripts/import-common-products.ts). Merges duplicate
 * Products that are the SAME item across retailers into one canonical Product
 * carrying every retailer's offer — so Compare shows Amazon / Walmart / Target /
 * IKEA side-by-side. Idempotent.
 *
 *   npx tsx --conditions=react-server scripts/link-cross-retailer.ts                        # dry run, cross-retailer only
 *   npx tsx --conditions=react-server scripts/link-cross-retailer.ts --apply                # execute
 *   npx tsx --conditions=react-server scripts/link-cross-retailer.ts --include-same-retailer # also dedupe within one retailer (riskier)
 */
import { loadEnv } from "./load-env.mjs";
loadEnv();

import { prisma } from "../src/lib/db/prisma";
import { linkCrossRetailer } from "../src/lib/matching/link-cross-retailer";

const apply = process.argv.includes("--apply");
const crossOnly = !process.argv.includes("--include-same-retailer");

linkCrossRetailer({ apply, crossOnly, log: true })
  .catch((e) => { console.error("link-cross-retailer failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
