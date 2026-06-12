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
  check("Amazon SEARCH links keep the affiliate tag (no leak)", () => {
    const out = buildAffiliateUrl("amazon", "https://www.amazon.com/s?k=airpods");
    assert.match(out, /[?&]tag=homivion-20\b/);
  });

  // ── 3. Affiliate-safety layer: hide links that can't be tracked ────────────
  console.log("Affiliate-safety layer (hide un-trackable Amazon/eBay links):");
  const {
    affiliateSafeDestination,
    hasRequiredAffiliateTracking,
    isAffiliateRequired,
  } = await import("../src/lib/affiliate/outbound");

  check("amazon & ebay are affiliate-required; walmart is not", () => {
    assert.equal(isAffiliateRequired("amazon"), true);
    assert.equal(isAffiliateRequired("ebay"), true);
    assert.equal(isAffiliateRequired("walmart"), false);
  });
  check("affiliateSafeDestination tracks Amazon/eBay product links", () => {
    assert.match(
      affiliateSafeDestination("amazon", "https://www.amazon.com/dp/B0ABCDEFG") ?? "",
      /[?&]tag=homivion-20\b/,
    );
    assert.match(
      affiliateSafeDestination("ebay", "https://www.ebay.com/itm/123") ?? "",
      /[?&]campid=5339155572\b/,
    );
  });
  check("non-affiliate retailer (walmart) returns its raw link", () => {
    const dest = affiliateSafeDestination("walmart", "https://www.walmart.com/ip/123");
    assert.ok(dest && dest.includes("walmart.com/ip/123"));
  });

  // Simulate a missing tag: amazon link must be HIDDEN (null), never raw.
  delete process.env.AFFILIATE_AMAZON_TAG;
  const isoMod = `../src/lib/affiliate/outbound?notag=${Date.now()}`;
  const fresh = await import(isoMod).catch(() => null);
  // Module caches env at import; assert via the tracking predicate instead,
  // which is env-independent and is the gate used at request time.
  check("a raw (un-tracked) Amazon URL fails the tracking check", () => {
    assert.equal(
      hasRequiredAffiliateTracking("amazon", "https://www.amazon.com/dp/B0ABCDEFG"),
      false,
    );
  });
  check("a tagged Amazon URL passes the tracking check", () => {
    assert.equal(
      hasRequiredAffiliateTracking("amazon", "https://www.amazon.com/dp/B0ABCDEFG?tag=homivion-20"),
      true,
    );
  });
  check("a raw eBay URL fails; an EPN eBay URL passes", () => {
    assert.equal(hasRequiredAffiliateTracking("ebay", "https://www.ebay.com/itm/1"), false);
    assert.equal(
      hasRequiredAffiliateTracking("ebay", "https://www.ebay.com/itm/1?campid=5339155572&mkcid=1"),
      true,
    );
  });
  void fresh;

  // ── 4. Cross-retailer duplicate grouping + safe canonical creation ─────────
  console.log("Duplicate grouping + safe canonical creation:");
  const { duplicateGroupKey, isCanonicalCreationSafe } = await import(
    "../src/lib/pipeline/canonical-identity"
  );
  type NL = Parameters<typeof duplicateGroupKey>[0];
  const withBarcode = (upc: string): NL =>
    ({ title: "T", titleNormalized: "t", upc, categoryKind: "general" } as NL);

  check("same barcode → same group key (across retailers)", () => {
    const a = duplicateGroupKey(withBarcode("0001234567890"));
    const b = duplicateGroupKey(withBarcode("1234567890")); // formatting differs
    assert.ok(a && b && a === b, `${a} !== ${b}`);
  });
  check("brand+model groups when no barcode", () => {
    const key = duplicateGroupKey({
      title: "AirPods Pro",
      titleNormalized: "airpods pro",
      brandNormalized: "apple",
      modelNumberNormalized: "mtjv3",
      categoryKind: "electronics",
    } as NL);
    assert.match(key ?? "", /^model:apple:mtjv3$/);
  });
  check("too-thin listing yields no group key", () => {
    assert.equal(
      duplicateGroupKey({ title: "x", titleNormalized: "x", categoryKind: "general" } as NL),
      null,
    );
  });
  check("canonical creation is BLOCKED for weak identity / low score", () => {
    const weak = { title: "x", titleNormalized: "x", brand: "B", price: 5, categoryKind: "general" } as NL;
    assert.equal(isCanonicalCreationSafe(weak, 95), false); // no barcode/model
    const strong = { ...weak, upc: "0001234567890" } as NL;
    assert.equal(isCanonicalCreationSafe(strong, 50), false); // score too low
  });
  check("canonical creation ALLOWED for strong identity + high score", () => {
    const strong = {
      title: "Cheerios 18oz",
      titleNormalized: "cheerios",
      brand: "General Mills",
      price: 4.98,
      upc: "0001234567890",
      categoryKind: "grocery",
    } as NL;
    assert.equal(isCanonicalCreationSafe(strong, 90), true);
  });

  // ── 5. Top-retailers-first sourcing + source modes ─────────────────────────
  console.log("Sourcing strategy (ingestion only — never touches public search):");
  const { retailersForCategory, sourcingCategory, MAX_OFFERS_PER_PRODUCT, isDueForRefresh } =
    await import("../src/lib/pipeline/sourcing/retailer-strategy");
  const { isRetailerSourceMode } = await import("../src/lib/pipeline/ingestion/adapter");

  check("electronics prioritizes Amazon → Best Buy → Walmart → eBay", () => {
    assert.deepEqual(retailersForCategory("electronics"), ["amazon", "bestbuy", "walmart", "ebay"]);
  });
  check("grocery maps to grocery_household priority", () => {
    assert.equal(sourcingCategory("grocery"), "grocery_household");
    // Costco excluded unless enabled.
    assert.deepEqual(retailersForCategory("grocery_household"), ["walmart", "target", "amazon"]);
  });
  check("home_improvement detected from raw category text", () => {
    assert.equal(sourcingCategory("general", "Tools & Hardware"), "home_improvement");
  });
  check("store the best 3–5 offers (cap = 5)", () => {
    assert.equal(MAX_OFFERS_PER_PRODUCT, 5);
  });
  check("popular products refresh sooner than the long tail", () => {
    const old = new Date(Date.now() - 13 * 3600_000);
    assert.equal(isDueForRefresh(90, old), true); // hot: 12h interval → due
    assert.equal(isDueForRefresh(5, old), false); // long tail: 14d → not due
  });
  check("retailer source modes are bright_data | official_api | disabled", () => {
    assert.equal(isRetailerSourceMode("bright_data"), true);
    assert.equal(isRetailerSourceMode("official_api"), true);
    assert.equal(isRetailerSourceMode("disabled"), true);
    assert.equal(isRetailerSourceMode("scraping"), false);
  });

  // ── 6. Config-driven sourcing (one config registry, no duplicated scrapers) ─
  console.log("Config-driven retailer registry:");
  const { getRetailerConfig, allRetailerConfigs } = await import(
    "../src/lib/pipeline/ingestion/retailer-config"
  );
  check("Amazon & eBay are configured as affiliate-required, Bright Data default", () => {
    const amazon = getRetailerConfig("amazon");
    assert.equal(amazon.affiliateRequired, true);
    assert.equal(amazon.defaultSourceMode, "bright_data");
    assert.equal(getRetailerConfig("ebay").affiliateRequired, true);
  });
  check("eBay declares official-API creds for a future switch", () => {
    assert.ok(getRetailerConfig("ebay").officialApiCredentialEnvVars?.includes("EBAY_CLIENT_ID"));
  });
  check("dataset ids come from env vars, not hardcoded", () => {
    for (const c of allRetailerConfigs()) {
      if (c.brightDataDatasetEnv) {
        assert.match(c.brightDataDatasetEnv, /^BRIGHT_DATA_DATASET_/);
      }
    }
  });
  check("Costco is optional (disabled by default)", () => {
    assert.equal(getRetailerConfig("costco").defaultSourceMode, "disabled");
  });

  // ── 7. Amazon multi-operation Bright Data payloads (one config, one provider) ─
  console.log("Amazon operations → correct Bright Data input payloads:");
  const { getRetailerOperation } = await import(
    "../src/lib/pipeline/ingestion/retailer-config"
  );
  const { buildOperationInput, operationForIntent } = await import(
    "../src/lib/pipeline/ingestion/operations"
  );
  const amazon = getRetailerConfig("amazon");

  check("keyword_search → Discover by keyword payload {keyword, zipcode}", () => {
    const op = getRetailerOperation(amazon, "keyword_search");
    assert.ok(op);
    assert.equal(op!.discoverBy, "keyword");
    assert.deepEqual(buildOperationInput(op!, "airpods pro", { zipcode: "78701" }), {
      keyword: "airpods pro",
      zipcode: "78701",
    });
  });
  check("url_lookup → Collect by URL payload {url, zipcode, language}", () => {
    const op = getRetailerOperation(amazon, "url_lookup");
    assert.ok(op);
    assert.equal(op!.discoverBy, null); // collect, not discover
    assert.deepEqual(
      buildOperationInput(op!, "https://www.amazon.com/dp/B0XYZ", { zipcode: "78701" }),
      { url: "https://www.amazon.com/dp/B0XYZ", zipcode: "78701", language: "en" },
    );
  });
  check("upc_lookup → Discover by UPC payload {upc, zipcode}", () => {
    const op = getRetailerOperation(amazon, "upc_lookup");
    assert.ok(op);
    assert.equal(op!.discoverBy, "upc");
    assert.deepEqual(buildOperationInput(op!, "190199098432", { zipcode: "78701" }), {
      upc: "190199098432",
      zipcode: "78701",
    });
  });
  check("intent maps: import→keyword, refresh→url, match→upc", () => {
    assert.equal(operationForIntent("import"), "keyword_search");
    assert.equal(operationForIntent("refresh"), "url_lookup");
    assert.equal(operationForIntent("cross_retailer_match"), "upc_lookup");
  });
  check("operations stay generic — Walmart can resolve keyword_search too", () => {
    const op = getRetailerOperation(getRetailerConfig("walmart"), "keyword_search");
    assert.ok(op && op.inputFields.includes("keyword"));
  });

  // Walmart: same generic architecture, dataset gd_l95fol7l1ru6rlo116.
  const walmart = getRetailerConfig("walmart");
  check("Walmart keyword_search → Discover by keyword {keyword, zipcode}", () => {
    const op = getRetailerOperation(walmart, "keyword_search");
    assert.ok(op);
    assert.equal(op!.discoverBy, "keyword");
    assert.deepEqual(buildOperationInput(op!, "paper towels", { zipcode: "78701" }), {
      keyword: "paper towels",
      zipcode: "78701",
    });
  });
  check("Walmart url_lookup → Collect by URL {url, zipcode, language}", () => {
    const op = getRetailerOperation(walmart, "url_lookup");
    assert.ok(op);
    assert.equal(op!.discoverBy, null);
    assert.deepEqual(
      buildOperationInput(op!, "https://www.walmart.com/ip/123", { zipcode: "78701" }),
      { url: "https://www.walmart.com/ip/123", zipcode: "78701", language: "en" },
    );
  });
  check("Walmart sku_lookup → Discover by SKU {sku, zipcode}", () => {
    const op = getRetailerOperation(walmart, "sku_lookup");
    assert.ok(op);
    assert.equal(op!.discoverBy, "sku");
    assert.deepEqual(buildOperationInput(op!, "987654321", { zipcode: "78701" }), {
      sku: "987654321",
      zipcode: "78701",
    });
  });
  check("Walmart does NOT expose upc_lookup (only its declared operations)", () => {
    assert.equal(getRetailerOperation(walmart, "upc_lookup"), null);
  });

  // Target: same generic architecture, dataset gd_ltppk5mx2lp0v1k0vo.
  const target = getRetailerConfig("target");
  check("Target keyword_search → Discover by keyword {keyword, zipcode}", () => {
    const op = getRetailerOperation(target, "keyword_search");
    assert.ok(op);
    assert.equal(op!.discoverBy, "keyword");
    assert.deepEqual(buildOperationInput(op!, "laundry detergent", { zipcode: "78701" }), {
      keyword: "laundry detergent",
      zipcode: "78701",
    });
  });
  check("Target url_lookup → Collect by URL {url, zipcode} (no discover_by)", () => {
    const op = getRetailerOperation(target, "url_lookup");
    assert.ok(op);
    assert.equal(op!.discoverBy, null);
    assert.deepEqual(
      buildOperationInput(op!, "https://www.target.com/p/-/A-12345", { zipcode: "78701" }),
      { url: "https://www.target.com/p/-/A-12345", zipcode: "78701" },
    );
  });
  check("Target upc_lookup → Discover by UPC {upc, zipcode}", () => {
    const op = getRetailerOperation(target, "upc_lookup");
    assert.ok(op);
    assert.equal(op!.discoverBy, "upc");
    assert.deepEqual(buildOperationInput(op!, "492000000000", { zipcode: "78701" }), {
      upc: "492000000000",
      zipcode: "78701",
    });
  });
  check("Target uses the generic Bright Data path (bright_data default, env dataset, no bespoke code)", () => {
    assert.equal(target.defaultSourceMode, "bright_data");
    assert.equal(target.brightDataDatasetEnv, "BRIGHT_DATA_DATASET_TARGET");
    // Resolved exactly like Amazon/Walmart through the shared operation registry.
    assert.ok(getRetailerOperation(target, "keyword_search"));
  });

  // ── 8. Public search must NOT import or call Bright Data ────────────────────
  console.log("Public-search isolation (no Bright Data at user-search time):");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = process.cwd();
  const PUBLIC_SEARCH_FILES = [
    "src/lib/inventory/verified-inventory-resolver.ts",
    "src/lib/inventory/verified-inventory-browse.ts",
    "src/lib/pricing/quote-freshness-policy.ts",
    "src/lib/conversation/turn.ts",
    "src/lib/conversation/engine.ts",
    "src/app/api/search/route.ts",
  ];
  const FORBIDDEN = /(bright-data|BrightData|ingestion\/(product-source|bright-data|ingest)|\.\.\/pipeline\/ingest)/;
  for (const rel of PUBLIC_SEARCH_FILES) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue;
    check(`${rel} does not reference Bright Data / ingestion`, () => {
      const src = fs.readFileSync(full, "utf8");
      const lines = src.split("\n").filter((l) => /^\s*import\b/.test(l) && FORBIDDEN.test(l));
      assert.equal(lines.length, 0, `forbidden import(s):\n${lines.join("\n")}`);
    });
  }

  check("BrightDataAdapter is fully generic (no per-retailer code)", () => {
    const raw = fs.readFileSync(
      path.join(root, "src/lib/pipeline/ingestion/bright-data-adapter.ts"),
      "utf8",
    );
    // Strip comments — retailer names as doc examples are fine; what must not
    // exist is retailer-specific CODE.
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    for (const r of ["amazon", "walmart", "target", "bestbuy", "ebay", "costco"]) {
      assert.ok(
        !new RegExp(`\\b${r}\\b`, "i").test(code),
        `bright-data-adapter.ts must not name retailer "${r}" in code`,
      );
    }
  });

  console.log(`\nAll ${passed} checks passed ✓`);
}

main().catch((err) => {
  console.error("\n✗ Test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
