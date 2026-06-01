import assert from "node:assert/strict";
import { resolveGroceryProduct, decomposeGroceryQuery, isGroceryQuery } from "../src/lib/search/grocery-retrieval";
import { resolvePrimaryProduct } from "../src/lib/search/product-resolver";

function testMilk() {
  const intent = { query: "Great Value Whole Milk", zipCode: "78701" };
  const decomposed = decomposeGroceryQuery(intent.query);
  assert.equal(decomposed.brand, "Great Value", "brand parsed");
  assert.ok(decomposed.normalized.includes("whole milk") || decomposed.tokens.includes("milk"), "milk tokens");
  const grocery = resolveGroceryProduct(intent);
  assert.ok(grocery, "grocery resolution should not null");
  assert.equal(grocery!.item.id, "milk-whole-gal", "matches Great Value whole milk catalog row");
  const primary = resolvePrimaryProduct(intent);
  assert.equal(primary.item.id, "milk-whole-gal", "primary resolver uses grocery tier");
}

function testCheezIt() {
  const query = "Cheez-It Original Cheese Crackers";
  const intent = { query, zipCode: "78701" };
  assert.ok(isGroceryQuery(query, intent), "cheez-it is grocery query");
  const decomposed = decomposeGroceryQuery(query);
  assert.equal(decomposed.brand, "Cheez-It", "cheez-it brand parsed");
  const grocery = resolveGroceryProduct(intent);
  assert.ok(grocery, "cheez-it grocery resolution should not null");
  assert.equal(grocery!.item.id, "cheese-crackers", "matches cheese crackers catalog row");
  const primary = resolvePrimaryProduct(intent);
  assert.equal(primary.item.id, "cheese-crackers", "primary resolver matches cheez-it");
}

testMilk();
testCheezIt();
console.log("Grocery retrieval tests passed.");
