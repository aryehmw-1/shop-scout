import test from "node:test";
import assert from "node:assert/strict";
import { rankVerifiedInventoryCandidates } from "./verified-inventory-resolver";
import { getFlagshipCatalogIds } from "./flagship-catalog";

// Regression: a flagship grocery item (e.g. "Spring Mix Salad") must NOT be a
// candidate for an unrelated query like "office chair". Before the fix, the
// flagship +15 bonus alone cleared the score>=12 gate with zero word overlap,
// and — because the salad had a persisted quote on production — it was accepted
// as a verified hit and shown as a $3.02 result.

test("office chair does not match any flagship grocery item", () => {
  const flagship = new Set(getFlagshipCatalogIds());
  const candidates = rankVerifiedInventoryCandidates("office chair");
  const flagshipHits = candidates.filter((c) => flagship.has(c.catalogId));
  assert.deepEqual(
    flagshipHits.map((c) => c.title),
    [],
    `office chair should match no flagship grocery item, got: ${flagshipHits
      .map((c) => c.title)
      .join(", ")}`,
  );
});

test("unrelated hardware queries do not match produce", () => {
  for (const q of ["office chair", "desk", "lamp", "refrigerator", "monitor"]) {
    const candidates = rankVerifiedInventoryCandidates(q);
    const salad = candidates.find((c) => /salad|spinach|romaine|lettuce/i.test(c.title));
    assert.equal(salad, undefined, `"${q}" should not match produce (${salad?.title})`);
  }
});

test("real grocery queries still resolve their flagship item", () => {
  // The fix must not regress grocery recall: a textual hit still scores.
  const milk = rankVerifiedInventoryCandidates("milk");
  assert.ok(milk.length > 0, "milk should still produce candidates");
  assert.ok(
    milk.some((c) => /milk/i.test(c.title)),
    "milk should still match a milk product",
  );
});
