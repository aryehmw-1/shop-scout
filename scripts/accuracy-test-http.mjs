/**
 * Fast accuracy test — parallel requests, no image APIs.
 * Usage: npm run dev  →  npm run test:accuracy
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
      /* try next port */
    }
  }
  return "http://127.0.0.1:3000";
}
const ZIP = "78701";
const AMAZON_TAG = process.env.AFFILIATE_AMAZON_TAG || "shopscout0d-20";
const LIMIT = parseInt(process.env.TEST_LIMIT || "100", 10);
const CONCURRENCY = parseInt(process.env.TEST_CONCURRENCY || "8", 10);

function parseCatalog() {
  const raw = readFileSync(
    join(__dirname, "../src/lib/retailers/catalog.ts"),
    "utf8",
  );
  const items = [];
  for (const block of raw.split(/\n  \{\n/)) {
    const id = block.match(/id: "([^"]+)"/)?.[1];
    const title = block.match(/title: "([^"]+)"/)?.[1];
    const brand = block.match(/brand: "([^"]+)"/)?.[1];
    const category = block.match(/category: "([^"]+)"/)?.[1];
    if (id && title) {
      items.push({ id, query: `${brand || ""} ${title}`.trim(), category });
    }
  }
  return items;
}

const EXTRA = [
  { id: "q-toddler", query: "toddler hoodie", ageGroup: "toddler" },
  { id: "q-shoes", query: "mens running shoes size 12", category: "shoes" },
  { id: "q-salad", query: "organic baby spinach", category: "salad" },
  { id: "q-kids", query: "kids winter jacket", ageGroup: "kids" },
];

function hostOk(url, retailer) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    const m = {
      amazon: "amazon",
      walmart: "walmart",
      target: "target",
      nike: "nike",
      marshalls: "marshalls",
      tjmaxx: "tjmaxx",
      barnesnoble: "barnesandnoble",
    };
    const k = m[retailer];
    return !k || h.includes(k);
  } catch {
    return false;
  }
}

async function search(baseUrl, test) {
  const res = await fetch(`${baseUrl}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: test.query,
      zipCode: ZIP,
      category: test.category,
      ageGroup: test.ageGroup,
      skipImages: true,
      skipPersist: true,
      skipCache: true,
      skipHistory: true,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).productResults;
}

function validate(test, offers, issues) {
  if (!offers?.length) {
    issues.push({ test, sev: "error", msg: "No offers" });
    return;
  }
  for (const o of offers) {
    if (o.price <= 0) issues.push({ test, sev: "error", msg: `Bad price ${o.retailer}` });
    if (o.productUrl?.startsWith("https://") && !o.productUrl.includes("google.com") && !hostOk(o.productUrl, o.retailer)) {
      issues.push({ test, sev: "error", msg: `URL mismatch ${o.retailer}` });
    }
    if (o.retailer === "amazon" && o.affiliateUrl && !o.affiliateUrl.includes(`tag=${AMAZON_TAG}`)) {
      issues.push({ test, sev: "warn", msg: "Amazon tag missing" });
    }
    const t = (o.storeTitle || o.title || "").toLowerCase();
    if ((test.ageGroup === "toddler" || test.ageGroup === "kids") && /\b(book|novel)\b/i.test(t)) {
      issues.push({ test, sev: "error", msg: `Book on kids query` });
    }
  }
}

async function runPool(baseUrl, cases) {
  const issues = [];
  let done = 0;
  let idx = 0;
  const started = Date.now();

  async function worker() {
    while (idx < cases.length) {
      const i = idx++;
      const test = cases[i];
      try {
        const pr = await search(baseUrl, test);
        validate(test, [...(pr.local || []), ...(pr.online || [])], issues);
      } catch (e) {
        issues.push({ test, sev: "error", msg: e.message });
      }
      done++;
      if (done % 20 === 0) {
        process.stdout.write(`\r  ${done}/${cases.length} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  process.stdout.write("\n");
  return { issues, ms: Date.now() - started };
}

async function main() {
  const BASE = await resolveBaseUrl();
  const cases = [...parseCatalog(), ...EXTRA].slice(0, LIMIT);
  console.log(`[accuracy] ${BASE} | ${cases.length} searches | concurrency ${CONCURRENCY} | skipImages`);

  try {
    const r = await fetch(`${BASE}/api/search/status`);
    if (!r.ok) throw new Error("API down");
  } catch {
    console.error("Start server: npm run dev");
    process.exit(1);
  }

  const { issues, ms } = await runPool(BASE, cases);
  const err = issues.filter((i) => i.sev === "error");
  const wrn = issues.filter((i) => i.sev === "warn");

  console.log(`Done in ${(ms / 1000).toFixed(1)}s — errors ${err.length}, warnings ${wrn.length}`);
  err.slice(0, 25).forEach((i) => console.log(`  ERR [${i.test.id}] ${i.msg}`));
  wrn.slice(0, 8).forEach((i) => console.log(`  WRN [${i.test.id}] ${i.msg}`));
  console.log("\nNote: Prices are estimates unless live Amazon/history data exists.");
  process.exit(err.length ? 1 : 0);
}

main();
