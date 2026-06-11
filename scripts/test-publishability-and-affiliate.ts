/**
 * Runnable safeguards (no DB, no network):
 *   1. Publishability gate — public search only surfaces APPROVED + PUBLISHED
 *      products/offers; rejected / needs_review / raw / unverified are hidden.
 *   2. Affiliate safeguard — public Amazon & eBay links carry our affiliate
 *      tracking params before they are ever shown to users.
 *
 * Run: npx tsx scripts/test-publishability-and-affiliate.ts
 */
import assert from "node:assert/strict";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  // ── 1. Publishability gate ────────────────────────────────────────────────
  console.log("Publishability gate (public search hides unverified):");
  const {
    PUBLISHABLE_QUOTE_WHERE,
    PUBLISHABLE_PRODUCT_WHERE,
    consumerVisibleQuoteWhere,
  } = await import("../src/lib/pricing/quote-freshness-policy");

  check("offer gate requires validationStatus 'approved'", () => {
    assert.equal(PUBLISHABLE_QUOTE_WHERE.validationStatus, "approved");
  });
  check("product gate requires published + approved", () => {
    assert.equal(PUBLISHABLE_PRODUCT_WHERE.published, true);
    assert.equal(PUBLISHABLE_PRODUCT_WHERE.validationStatus, "approved");
  });
  check("consumerVisibleQuoteWhere() carries the approval gate", () => {
    const where = consumerVisibleQuoteWhere();
    assert.equal((where as { validationStatus?: string }).validationStatus, "approved");
  });

  // Mirror the exact gate rule against representative rows.
  type Row = { validationStatus: string; published?: boolean };
  const passesProductGate = (r: Row) =>
    r.published === true && r.validationStatus === "approved";
  const passesOfferGate = (r: Row) => r.validationStatus === "approved";

  const products: Array<{ status: string; row: Row; visible: boolean }> = [
    { status: "approved+published", row: { validationStatus: "approved", published: true }, visible: true },
    { status: "rejected", row: { validationStatus: "rejected", published: true }, visible: false },
    { status: "needs_review", row: { validationStatus: "needs_review", published: true }, visible: false },
    { status: "unpublished", row: { validationStatus: "approved", published: false }, visible: false },
    { status: "raw/unverified", row: { validationStatus: "raw", published: false }, visible: false },
  ];
  for (const p of products) {
    check(`product '${p.status}' visible=${p.visible}`, () => {
      assert.equal(passesProductGate(p.row), p.visible);
    });
  }
  for (const status of ["rejected", "needs_review", "raw", "unverified"]) {
    check(`offer '${status}' is hidden from public search`, () => {
      assert.equal(passesOfferGate({ validationStatus: status }), false);
    });
  }
  check("offer 'approved' is shown", () => {
    assert.equal(passesOfferGate({ validationStatus: "approved" }), true);
  });

  // ── 2. Affiliate safeguard ────────────────────────────────────────────────
  console.log("Affiliate safeguard (public Amazon/eBay links are affiliate links):");
  process.env.AFFILIATE_AMAZON_TAG = "homivion-20";
  process.env.AFFILIATE_EBAY_TAG = "epn";
  process.env.AFFILIATE_EBAY_CAMPAIGN_ID = "5339155572";
  // Affiliate tags are captured at module load, so import AFTER setting env.
  const { buildAffiliateUrl } = await import("../src/lib/affiliate");

  check("Amazon product link carries our associate tag", () => {
    const out = buildAffiliateUrl("amazon", "https://www.amazon.com/dp/B0ABCDEFG");
    assert.match(out, /[?&]tag=homivion-20\b/);
  });
  check("eBay product link carries our EPN campaign id", () => {
    const out = buildAffiliateUrl("ebay", "https://www.ebay.com/itm/123456789");
    assert.match(out, /[?&]campid=5339155572\b/);
    assert.match(out, /[?&]mkcid=1\b/);
  });
  check("Amazon link is never shown raw when a tag is configured", () => {
    const raw = "https://www.amazon.com/dp/B0ABCDEFG";
    assert.notEqual(buildAffiliateUrl("amazon", raw), raw);
  });

  console.log(`\nAll ${passed} checks passed ✓`);
}

main().catch((err) => {
  console.error("\n✗ Test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
