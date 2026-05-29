/**
 * Spot-check retailer search URLs + category searches.
 * Usage: npm run dev  →  node scripts/test-retailer-search.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function resolveBaseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  for (const port of [3001, 3000]) {
    const url = `http://127.0.0.1:${port}`;
    try {
      const c = new AbortController();
      setTimeout(() => c.abort(), 2500);
      const r = await fetch(`${url}/api/search/status`, { signal: c.signal });
      if (r.ok) return url;
    } catch {
      /* next */
    }
  }
  return null;
}

function loadRetailerIds() {
  const raw = readFileSync(
    join(__dirname, "../src/lib/retailers/meta.ts"),
    "utf8",
  );
  const ids = [];
  for (const m of raw.matchAll(/id: "([^"]+)"/g)) ids.push(m[1]);
  return [...new Set(ids)];
}

const HOST_HINTS = {
  amazon: "amazon",
  walmart: "walmart",
  target: "target",
  nike: "nike",
  barnesnoble: "barnesandnoble",
  mattressfirm: "mattressfirm",
  wayfair: "wayfair",
  ikea: "ikea",
  kohls: "kohls",
  macys: "macys",
  gerber: "gerberchildrenswear",
  tjmaxx: "tjmaxx",
  marshalls: "marshalls",
};

function urlOk(url, retailer) {
  if (!url?.startsWith("https://")) return false;
  if (url.includes("google.com/search")) return true;
  const hint = HOST_HINTS[retailer];
  if (!hint) return true;
  try {
    return new URL(url).hostname.toLowerCase().includes(hint);
  } catch {
    return false;
  }
}

async function search(baseUrl, query, category) {
  const res = await fetch(`${baseUrl}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      zipCode: "78701",
      category,
      skipImages: true,
      skipPersist: true,
      skipCache: true,
      skipHistory: true,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).productResults;
}

async function main() {
  const baseUrl = await resolveBaseUrl();
  if (!baseUrl) {
    console.error("Start dev server first: npm run dev");
    process.exit(1);
  }

  const cases = [
    { name: "beds", query: "beds", category: "bedding", retailers: ["mattressfirm", "wayfair", "ikea"] },
    { name: "books @ B&N", query: "fiction novel", category: "books", retailers: ["barnesnoble", "booksamillion"] },
    { name: "mens pants", query: "mens joggers", category: "clothing", retailers: [] },
  ];

  const issues = [];
  const retailerIds = loadRetailerIds();

  for (const test of cases) {
    const results = await search(baseUrl, test.query, test.category);
    const offers = results?.online ?? [];
    console.log(`\n=== ${test.name} (${offers.length} online offers) ===`);
    if (offers.length === 0) {
      issues.push(`${test.name}: no results`);
      continue;
    }
    const titles = new Set(offers.map((o) => o.title?.slice(0, 40)));
    console.log(`  Products: ${[...titles].slice(0, 3).join(" | ")}`);

    for (const rid of test.retailers) {
      const hit = offers.find((o) => o.retailer === rid);
      if (!hit) {
        issues.push(`${test.name}: missing ${rid}`);
        console.log(`  ✗ ${rid}: not in results`);
        continue;
      }
      const ok = urlOk(hit.productUrl, rid);
      console.log(`  ${ok ? "✓" : "✗"} ${rid}: ${hit.productUrl?.slice(0, 70)}…`);
      if (!ok) issues.push(`${test.name}: bad URL for ${rid}`);
    }

    for (const o of offers) {
      if (!urlOk(o.productUrl, o.retailer)) {
        issues.push(`${test.name}: bad URL ${o.retailer}`);
      }
    }
  }

  // Sample URL for every shoppable retailer via synthetic search
  console.log("\n=== Retailer URL sample (spot check) ===");
  const sample = await search(baseUrl, "organic milk", "dairy");
  const byRetailer = new Map((sample?.online ?? []).map((o) => [o.retailer, o]));
  let urlFails = 0;
  for (const id of retailerIds.slice(0, 30)) {
    const o = byRetailer.get(id);
    if (!o) continue;
    if (!urlOk(o.productUrl, id)) {
      urlFails++;
      if (urlFails <= 8) issues.push(`URL host mismatch: ${id} → ${o.productUrl}`);
    }
  }

  console.log(`\nDone. ${issues.length} issue(s).`);
  if (issues.length) {
    for (const i of issues.slice(0, 20)) console.log(" -", i);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
