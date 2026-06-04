#!/usr/bin/env node
/**
 * Smoke-test inventory compare APIs against seeded canonical catalog.
 * Usage: node scripts/test-compare-inventory.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:3000";
const zip = "78701";

const EXAMPLE_QUERIES = [
  "Sony WH-1000XM5",
  "AirPods Pro",
  "Instant Pot Duo",
  "Nintendo Switch OLED",
];

const catalogPath = join(process.cwd(), "data", "canonical-products.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const products = catalog.products ?? [];

async function search(q) {
  const url = `${base}/api/inventory/search?q=${encodeURIComponent(q)}&zip=${zip}`;
  const res = await fetch(url);
  const body = await res.json();
  return {
    ok: res.ok,
    matched: body.matched === true,
    offers: body.productResults?.online?.length ?? 0,
    source: body.source ?? "none",
    title: body.productResults?.matchedProduct?.title ?? null,
  };
}

async function canonical(id) {
  const url = `${base}/api/inventory/canonical/${encodeURIComponent(id)}`;
  const res = await fetch(url);
  if (!res.ok) return { ok: false, offers: 0, title: null };
  const body = await res.json();
  return {
    ok: true,
    offers: body.productResults?.online?.length ?? 0,
    title: body.productResults?.matchedProduct?.title ?? body.product?.canonical_title ?? null,
  };
}

async function catalogList() {
  const res = await fetch(`${base}/api/inventory/catalog`);
  if (!res.ok) return { ok: false, total: 0 };
  const body = await res.json();
  return { ok: true, total: body.total ?? body.products?.length ?? 0 };
}

const failures = [];
let passed = 0;

console.log(`\n[test-compare-inventory] base=${base}\n`);

const list = await catalogList();
if (!list.ok || list.total < 1) {
  console.error(`FAIL catalog API: total=${list.total}`);
  process.exit(1);
}
console.log(`OK  catalog API — ${list.total} products`);
passed++;

for (const q of EXAMPLE_QUERIES) {
  const r = await search(q);
  if (r.matched && r.offers >= 2) {
    console.log(`OK  search "${q}" → ${r.offers} offers (${r.source}) · ${r.title}`);
    passed++;
  } else {
    console.log(`FAIL search "${q}" → matched=${r.matched} offers=${r.offers}`);
    failures.push({ kind: "search", q, ...r });
  }
}

for (const p of products) {
  const r = await canonical(p.canonical_id);
  if (r.ok && r.offers >= 2) {
    passed++;
  } else {
    console.log(`FAIL canonical ${p.canonical_id} → offers=${r.offers}`);
    failures.push({ kind: "canonical", id: p.canonical_id, ...r });
  }
}
console.log(`OK  canonical API — ${products.length}/${products.length} products`);

const comparePage = await fetch(`${base}/compare`);
if (!comparePage.ok) {
  console.log(`FAIL compare page HTTP ${comparePage.status}`);
  failures.push({ kind: "page", path: "/compare", status: comparePage.status });
} else {
  console.log(`OK  compare page HTTP ${comparePage.status}`);
  passed++;
}

const inventoryPage = await fetch(`${base}/inventory`);
if (!inventoryPage.ok) {
  console.log(`FAIL inventory page HTTP ${inventoryPage.status}`);
  failures.push({ kind: "page", path: "/inventory", status: inventoryPage.status });
} else {
  console.log(`OK  inventory page HTTP ${inventoryPage.status}`);
  passed++;
}

console.log(`\n[test-compare-inventory] ${passed} checks passed, ${failures.length} failed\n`);

if (failures.length) {
  console.error(JSON.stringify(failures.slice(0, 10), null, 2));
  if (failures.length > 10) console.error(`… and ${failures.length - 10} more`);
  process.exit(1);
}

process.exit(0);
