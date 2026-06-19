import test from "node:test";
import assert from "node:assert/strict";
import type { ProductOffer } from "../types";
import {
  offerMatchesQuery,
  looksLikeAccessoryMismatch,
  isTypeModifierMismatch,
  filterRelevantOffers,
} from "./result-relevance";

const mk = (title: string, price: number, brand = ""): ProductOffer =>
  ({ id: title, title, storeTitle: title, brand, price } as unknown as ProductOffer);

test("offerMatchesQuery: zero-overlap fallback is rejected", () => {
  // The production bug: a default "Spring Mix Salad" surfaced for "office chair".
  assert.equal(offerMatchesQuery("office chair", mk("Taylor Farms Spring Mix Salad, 5 oz", 3.02)), false);
  assert.equal(offerMatchesQuery("refrigerator", mk("Taylor Farms Spring Mix Salad", 3.02)), false);
  // Real chairs share "chair".
  assert.equal(offerMatchesQuery("office chair", mk("Home Office Chair Ergonomic", 59.99)), true);
});

test("looksLikeAccessoryMismatch: parts/accessories/novelty dropped", () => {
  assert.equal(looksLikeAccessoryMismatch("office chair", mk("Office Chair Replacement Wheels 5pc", 9.99)), true);
  assert.equal(looksLikeAccessoryMismatch("office chair", mk("Office Chair Seat Cushion", 14.99)), true);
  assert.equal(looksLikeAccessoryMismatch("refrigerator", mk("Refrigerator Water Filter", 12.99)), true);
  assert.equal(looksLikeAccessoryMismatch("lamp", mk("Lamp Shade Beige Drum", 19.99)), true);
  assert.equal(looksLikeAccessoryMismatch("office chair", mk("Toy Office Chair Miniature", 4.99)), true);
  // A real chair with no accessory word stays.
  assert.equal(looksLikeAccessoryMismatch("office chair", mk("Ergonomic Office Chair High Back", 89.99)), false);
  // If the user explicitly asks for the accessory, keep it.
  assert.equal(looksLikeAccessoryMismatch("refrigerator water filter", mk("Refrigerator Water Filter", 12.99)), false);
  // "cleaner" distinction: a refrigerator/microwave cleaner is an accessory, but a
  // vacuum cleaner IS the appliance.
  assert.equal(looksLikeAccessoryMismatch("refrigerator", mk("Affresh Refrigerator Cleaner Spray", 6.99)), true);
  assert.equal(looksLikeAccessoryMismatch("microwave", mk("Microwave Cleaner Steam Spray", 5.99)), true);
  assert.equal(looksLikeAccessoryMismatch("vacuum", mk("Dyson V8 Cordless Vacuum Cleaner", 299)), false);
  assert.equal(looksLikeAccessoryMismatch("carpet", mk("BISSELL Carpet Cleaner Machine", 129)), false);
});

test("isTypeModifierMismatch: single-word type as a modifier of another product", () => {
  // "desk" → "Desk Lamp" (different product), reject.
  assert.equal(isTypeModifierMismatch("desk", mk("IKEA RÖDFLIK Desk lamp - gray-green", 39.99)), true);
  assert.equal(isTypeModifierMismatch("lamp", mk("Lamp Shade Beige Drum", 19.99)), true);
  assert.equal(isTypeModifierMismatch("refrigerator", mk("Vgogfly Refrigerator Light Bulb", 6.99)), true);
  // Compound names with a generic container word stay.
  assert.equal(isTypeModifierMismatch("microwave", mk("Mainstays Countertop Microwave Oven 0.7", 45.99)), false);
  // The query word AS the head stays.
  assert.equal(isTypeModifierMismatch("desk", mk("MICKE Computer Desk white", 79.99)), false);
  assert.equal(isTypeModifierMismatch("lamp", mk("TÄRNABY Table lamp dimmable", 34.99)), false);
  // Multi-word queries are unaffected.
  assert.equal(isTypeModifierMismatch("office chair", mk("Office Chair Lamp combo", 9.99)), false);
});

test("filterRelevantOffers: salad dropped, chairs kept", () => {
  const offers = [
    mk("Taylor Farms Spring Mix Salad", 3.02),
    mk("Home Office Chair Ergonomic", 59.99),
    mk("Staples Gaming Chair High Back", 75.99),
  ];
  const kept = filterRelevantOffers(offers, "office chair");
  assert.deepEqual(kept.map((o) => o.price), [59.99, 75.99]);
});

test("filterRelevantOffers: drops a $3 low-price outlier among real chairs", () => {
  const offers = [
    mk("Office Chair Mini Part", 3.0),
    mk("Office Chair A", 40),
    mk("Office Chair B", 45),
    mk("Office Chair C", 50),
  ];
  const kept = filterRelevantOffers(offers, "office chair");
  assert.ok(!kept.some((o) => o.price === 3.0), "the $3 fragment should be dropped");
  assert.ok(kept.length >= 3);
});

test("filterRelevantOffers: never empties a set of relevant offers", () => {
  const offers = [mk("Ninja Air Fryer Max XL", 124.9), mk("Ninja Air Fryer Max XL", 130.29)];
  assert.equal(filterRelevantOffers(offers, "air fryer").length, 2);
});

test("vacuum: insulated water bottle dropped, real cleaners kept", () => {
  // The word "vacuum" is only the insulation tech in a trailing feature clause.
  const goswag =
    "GOSWAG Insulated Sports Water Bottle, 24oz 2 Lids, Stainless Steel Water Bottles with Double-Wall Vacuum Insulation";
  assert.equal(filterRelevantOffers([mk(goswag, 20.99)], "vacuum", "Vacuum").length, 0);
  for (const t of [
    "Shark Navigator Lift-Away Upright Vacuum, NV356E",
    "Dyson V8 Cordless Vacuum Cleaner",
    "BISSELL CleanView Bagless Vacuum Cleaner",
  ]) {
    assert.equal(filterRelevantOffers([mk(t, 159)], "vacuum", "Vacuum").length, 1, t);
  }
});

test("microwave: ovens + combos kept, accessories dropped", () => {
  for (const t of [
    "FRIGIDAIRE 1.2 cu ft Microwave, Digital Air Fryer Combo",
    "Toshiba Microwave Oven 0.9 cu ft",
  ]) {
    assert.equal(filterRelevantOffers([mk(t, 99)], "microwave", "Microwave").length, 1, t);
  }
  for (const t of [
    "Microwave Turntable Glass Plate Replacement 12.4in",
    "Microwave Splatter Cover Lid",
    "Universal Microwave Oven Tray",
  ]) {
    assert.equal(filterRelevantOffers([mk(t, 9)], "microwave", "Microwave").length, 0, t);
  }
});
