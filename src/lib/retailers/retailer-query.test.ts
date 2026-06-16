import test from "node:test";
import assert from "node:assert/strict";
import { extractRetailerFromQuery } from "./retailer-query";

test("pulls the retailer out and leaves the product query", () => {
  assert.deepEqual(extractRetailerFromQuery("Target shirt"), { retailer: "target", query: "shirt" });
  assert.deepEqual(extractRetailerFromQuery("Walmart TV"), { retailer: "walmart", query: "TV" });
  assert.deepEqual(extractRetailerFromQuery("Amazon iPhone charger"), {
    retailer: "amazon",
    query: "iPhone charger",
  });
  assert.deepEqual(extractRetailerFromQuery("eBay iPhone charger"), {
    retailer: "ebay",
    query: "iPhone charger",
  });
  assert.deepEqual(extractRetailerFromQuery("best buy laptop"), { retailer: "bestbuy", query: "laptop" });
});

test("does not strip when the retailer name is the whole query", () => {
  assert.deepEqual(extractRetailerFromQuery("walmart"), { query: "walmart" });
  assert.deepEqual(extractRetailerFromQuery("Amazon"), { query: "Amazon" });
});

test("leaves brand-only names (not stores) in the query", () => {
  // Nike is a brand, not a multi-brand store — must stay in the product query.
  assert.deepEqual(extractRetailerFromQuery("nike running shoes"), { query: "nike running shoes" });
});
