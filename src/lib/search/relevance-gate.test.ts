// Relevance-gate tests — the guard that keeps "Similar alternatives" on-topic and
// rejects weak catalog lookalikes. Pure functions, no DB. Run: `npm test`.
//
// Regression target: searching "...Car Trash Bag..." surfaced "Original Cheese
// Crackers" as a similar alternative. Unrelated products must be BLOCKED; if
// nothing relevant exists, show nothing.

import test from "node:test";
import assert from "node:assert/strict";
import {
  coversQueryExpanded,
  sharesContentWord,
  sharesProductType,
  isShortQuery,
  matchesAsHeadTerm,
} from "./query-understanding";

// ── coversQueryExpanded: the catalog-match relevance FLOOR ──
// (a weak lookalike that shares no real content word must NOT be treated as a match)

test("car trash bag does not match a snack lookalike", () => {
  assert.equal(coversQueryExpanded("Original Cheese Crackers Snacks", "car trash bag"), false);
  assert.equal(coversQueryExpanded("Honey Nut Cheerios Cereal", "car trash bag"), false);
  // a genuine car trash bag/can DOES match
  assert.equal(coversQueryExpanded("Hefty Car Trash Bag 30ct", "car trash bag"), true);
  assert.equal(coversQueryExpanded("Hanging Car Garbage Trash Can", "car trash bag"), true);
});

test("fridge still matches a refrigerator (synonym-aware floor)", () => {
  assert.equal(coversQueryExpanded("Whirlpool Refrigerator 25 cu ft", "fridge"), true);
  assert.equal(coversQueryExpanded("Keurig K-Mini Coffee Maker", "fridge"), false);
});

// ── sharesContentWord: the SIMILAR-alternative gate (must share a query word) ──

test("car trash bag should not return food", () => {
  assert.equal(sharesContentWord("car trash bag", "Original Cheese Crackers"), false);
  assert.equal(sharesContentWord("car trash bag", "Honey Nut Cheerios"), false);
  // closely related trash products are allowed
  assert.equal(sharesContentWord("car trash bag", "Glad Small Trash Bags 4 Gallon"), true);
  assert.equal(sharesContentWord("car trash bag", "Hanging Car Garbage Can"), true);
});

test("air fryer should not return chargers", () => {
  assert.equal(sharesContentWord("air fryer", "Anker USB-C Wall Charger 65W"), false);
  assert.equal(sharesContentWord("air fryer", "Apple iPhone Lightning Charger"), false);
  assert.equal(sharesContentWord("air fryer", "Cosori Pro II Air Fryer 5.8 Qt"), true);
});

test("Honey Nut Cheerios should return cereal or nothing (never coffee/snacks)", () => {
  assert.equal(sharesContentWord("Honey Nut Cheerios", "Folgers Classic Roast Coffee"), false);
  assert.equal(sharesContentWord("Honey Nut Cheerios", "Original Cheese Crackers"), false);
  // related cereal is allowed (shares "cheerios"/"honey"/"nut")
  assert.equal(sharesContentWord("Honey Nut Cheerios", "Cheerios Multi Grain Cereal"), true);
  assert.equal(sharesContentWord("Honey Nut Cheerios", "Honey Bunches of Oats"), true);
});

test("refrigerator should not return coffee", () => {
  assert.equal(sharesContentWord("refrigerator", "Keurig K-Mini Coffee Maker"), false);
  assert.equal(sharesContentWord("refrigerator", "Folgers Ground Coffee"), false);
  // a real fridge (incl. the "fridge" synonym) is allowed
  assert.equal(sharesContentWord("refrigerator", "Whirlpool Refrigerator 25 cu ft"), true);
  assert.equal(sharesContentWord("refrigerator", "Mini Fridge 3.2 cu ft"), true);
});

test("empty / junk query returns no alternatives (show nothing, not noise)", () => {
  assert.equal(sharesContentWord("", "Anything At All"), false);
  assert.equal(sharesContentWord("   ", "Cheese Crackers"), false);
});

// ── matchesAsHeadTerm: short-query incidental-keyword gate (P2) ──

test("short query is detected for 1-2 content words", () => {
  assert.equal(isShortQuery("refrigerator"), true);
  assert.equal(isShortQuery("air fryer"), true);
  assert.equal(isShortQuery("car trash bag large capacity hanging"), false);
});

test("refrigerator does not match a refrigerator-SAFE juice bottle", () => {
  // "refrigerator" appears late, as a descriptor — must NOT count as a match.
  assert.equal(
    matchesAsHeadTerm(
      "refrigerator",
      "Mrsdry Glass Juice Bottles with Lids 18 oz, Reusable for Juicing, Refrigerator, BPA Free",
      "drinkware",
    ),
    false,
  );
  // A real refrigerator names its type up front.
  assert.equal(matchesAsHeadTerm("refrigerator", "Whirlpool Refrigerator 25 cu ft", "appliances"), true);
  // Synonym: "fridge" query → "Refrigerator" head term.
  assert.equal(matchesAsHeadTerm("fridge", "Frigidaire Refrigerator 18 cu ft", "appliances"), true);
});

test("short-query head gate uses the head region, not front modifiers", () => {
  assert.equal(matchesAsHeadTerm("charger", "Anker 65W USB-C Charger", "electronics"), true);
  // "refrigerator" is a front modifier here; the head is "light bulb" → reject.
  assert.equal(
    matchesAsHeadTerm("refrigerator", "Vgogfly LED Refrigerator Light Bulb 40W Equivalent", "lighting"),
    false,
  );
  // real fridge: refrigerator is in the head region → accept.
  assert.equal(matchesAsHeadTerm("refrigerator", "Whirlpool Refrigerator 25 cu ft", "appliances"), true);
});

// ── sharesProductType: type-coherence for similar/broadened fallbacks ──

test("broadened fallback stays within the query's product type", () => {
  // "Ninja Air Fryer Max XL" type = fryer
  assert.equal(sharesProductType("Ninja Air Fryer Max XL", "Cosori Pro II Air Fryer 5.8 Qt", "kitchen"), true);
  assert.equal(sharesProductType("Ninja Air Fryer Max XL", "Ninja Professional Blender 1000W", "kitchen"), false);
  // "refrigerator" type = refrigerator
  assert.equal(sharesProductType("refrigerator", "Frigidaire Refrigerator 18 cu ft", "appliances"), true);
  assert.equal(sharesProductType("refrigerator", "Vgogfly LED Refrigerator Light Bulb", "lighting"), false);
});
