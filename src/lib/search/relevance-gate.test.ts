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
