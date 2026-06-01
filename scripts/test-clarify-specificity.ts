import assert from "node:assert/strict";
import { detectClarificationNeeded } from "../src/lib/ai/clarify-intent";
import { isObviousProductSearch } from "../src/lib/ai/product-query-specificity";
import { findBroadKeywordRule } from "../src/lib/ai/shopping-keywords";

function expectNoClarify(query: string, label: string) {
  assert.equal(
    isObviousProductSearch(query),
    true,
    `${label}: should be obvious product search`,
  );
  assert.equal(
    findBroadKeywordRule(query),
    undefined,
    `${label}: broad keyword rule should not fire`,
  );
  assert.equal(
    detectClarificationNeeded(query, {}),
    null,
    `${label}: should not need clarification`,
  );
}

function expectClarify(query: string, label: string) {
  assert.equal(
    isObviousProductSearch(query),
    false,
    `${label}: should not be obvious product search`,
  );
  assert.ok(
    detectClarificationNeeded(query, {}) ?? findBroadKeywordRule(query),
    `${label}: should need clarification`,
  );
}

expectNoClarify("Lay's Classic Potato Chips", "Lay's chips");
expectNoClarify("Folgers Breakfast Blend Ground Coffee", "Folgers coffee");
expectNoClarify("Honey Nut Cheerios cereal", "Cheerios cereal");
expectNoClarify("Bounty Select-A-Size paper towels", "Bounty towels");

expectClarify("chips", "bare chips");
expectClarify("snacks", "bare snacks");
expectClarify("coffee", "bare coffee");
expectClarify("salad", "bare salad");
expectClarify("milk", "bare milk");

console.log("All clarification specificity tests passed.");
