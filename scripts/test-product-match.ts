/**
 * Golden product match relevance tests.
 * Usage: npm run test:product-match
 */
import { CATALOG } from "../src/lib/retailers/catalog";
import { analyzeProductMatch } from "../src/lib/offers/product-match-analysis";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function item(id: string) {
  const found = CATALOG.find((c) => c.id === id);
  if (!found) throw new Error(`missing catalog item ${id}`);
  return found;
}

function main() {
  const chips = item("potato-chips");
  const intent = { query: "Lay's Classic Potato Chips", zipCode: "78701" };

  const variety = analyzeProductMatch(
    "Lay's Potato Chips, 4 Flavor Variety Pack, 40 Pack",
    chips,
    intent,
    0.86,
  );

  assert(variety.band === "rejected", `variety pack should be rejected, got ${variety.band}`);
  assert(variety.confidence < 0.45, `variety pack confidence too high: ${variety.confidence}`);
  assert(variety.shouldReject, "variety pack shouldReject");
  assert(
    variety.reasons.some((r) => r.code === "match.variety_pack"),
    "expected variety_pack reason",
  );

  const classic = analyzeProductMatch(
    "Lay's Classic Potato Chips, 8 oz",
    chips,
    intent,
    0.72,
  );
  assert(
    classic.band === "exact_verified" || classic.band === "likely_match",
    `classic single bag should be exact/likely, got ${classic.band}`,
  );
  assert(classic.confidence >= 0.72, `classic confidence too low: ${classic.confidence}`);

  const milk = item("milk-whole-gal");
  const milkIntent = { query: "whole milk", zipCode: "78701" };
  const wrongSize = analyzeProductMatch(
    "Great Value Whole Milk, 1 Gallon, 2 Pack",
    milk,
    milkIntent,
    0.8,
  );
  assert(
    wrongSize.confidence < 0.65 || wrongSize.band === "brand_alternative" || wrongSize.band === "similar",
    `2-pack milk should not be exact: ${wrongSize.band} @ ${wrongSize.confidence}`,
  );

  console.log("✓ product match relevance tests passed");
}

try {
  main();
} catch (e) {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
}
