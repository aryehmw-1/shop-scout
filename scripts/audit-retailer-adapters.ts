/**
 * Lists retailers with dedicated adapters vs generic HTML parser.
 * Run: npx tsx scripts/audit-retailer-adapters.ts
 */
import { RETAILERS } from "../src/lib/retailers/meta";
import {
  listConfiguredRetailerAdapters,
  retailerAdaptersEnabled,
} from "../src/lib/offers/retailer-adapters";
import { indexScrapeSkipRetailers } from "../src/lib/offers/enrich-retailer-targets";
import type { RetailerId } from "../src/lib/types";

const GROCERY = new Set([
  "salad",
  "dairy",
  "bakery",
  "produce",
  "meat",
  "pantry",
  "household",
]);

const ENRICH_PRIORITY_SAMPLE: RetailerId[] = [
  "walmart",
  "target",
  "amazon",
  "aldi",
  "heb",
  "publix",
  "costco",
  "kroger",
  "sams",
  "safeway",
  "macys",
  "gap",
];

const adapters = new Set(listConfiguredRetailerAdapters());
const skip = indexScrapeSkipRetailers();
const allIds = RETAILERS.map((r) => r.id);

const generic = allIds.filter((id) => !adapters.has(id));
const withAdapter = allIds.filter((id) => adapters.has(id));

console.log("=== Retailer adapter audit ===\n");
console.log("Adapters enabled:", retailerAdaptersEnabled());
console.log("Dedicated adapters:", [...adapters].sort().join(", "));
console.log("Default scrape skip:", [...skip].join(", ") || "(none)");
console.log("\nCounts:");
console.log("  Total shoppable retailers:", allIds.length);
console.log("  With dedicated adapter:", withAdapter.length);
console.log("  Generic parser only:", generic.length);

console.log("\n--- High-priority index targets (sample) ---");
for (const id of ENRICH_PRIORITY_SAMPLE) {
  const tier =
    skip.has(id) ? "SKIP"
    : adapters.has(id) ? "ADAPTER"
    : "GENERIC";
  console.log(`  ${tier.padEnd(8)} ${id}`);
}

console.log("\n--- Grocery retailers (no dedicated adapter yet) ---");
const groceryGeneric = RETAILERS.filter(
  (r) => r.types.includes("grocery") && !adapters.has(r.id),
).map((r) => r.id);
console.log(groceryGeneric.slice(0, 40).join(", "));
if (groceryGeneric.length > 40) {
  console.log(`  … +${groceryGeneric.length - 40} more`);
}

console.log("\n--- Suggested next adapters (by category traffic) ---");
const nextCandidates: RetailerId[] = [
  "heb",
  "publix",
  "safeway",
  "albertsons",
  "sams",
  "wholefoods",
  "hyvee",
  "meijer",
  "instacart",
];
for (const id of nextCandidates) {
  if (!adapters.has(id)) console.log("  -", id);
}

console.log("\n--- All generic-only retailers ---");
console.log(generic.sort().join(", "));
