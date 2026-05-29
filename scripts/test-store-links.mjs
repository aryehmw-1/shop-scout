/**
 * Spot-check store link query cleaning + junk URL rejection.
 * Usage: node scripts/test-store-links.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load compiled modules via tsx register if available, else inline checks
const root = join(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const { register } = await import("tsx/esm/api").catch(() => ({ register: null }));
  if (register) register();

  const { buildStoreSearchQuery } = await import(
    join(root, "src/lib/retailers/store-search-query.ts")
  );
  const { shouldUseStoredProductUrl } = await import(
    join(root, "src/lib/retailers/product-link-url.ts")
  );
  const { buildOfferClickUrl } = await import(
    join(root, "src/lib/retailers/retailer-url.ts")
  );

  const item = {
    id: "test",
    slug: "test",
    brand: "Various brands",
    title: "Women's Sweaters",
    size: "Medium",
    upc: "",
  };
  const intent = { query: "Womens Medium Sky Daisies Sweater", zipCode: "78701" };

  const q = buildStoreSearchQuery(item, intent);
  assert(
    !q.toLowerCase().includes("various brands"),
    `query should drop brand noise: ${q}`,
  );
  assert(
    q.toLowerCase().includes("sky daisies"),
    `query should keep product terms: ${q}`,
  );
  assert(q.length < 60, `query should be short: ${q}`);

  assert(
    !shouldUseStoredProductUrl("https://tjmaxx.tjx.com/store/index.jsp", "tjmaxx"),
    "index.jsp should be rejected",
  );

  const { productUrl } = buildOfferClickUrl(
    "tjmaxx",
    { ...item, title: "Sky Daisies Sweater" },
    intent,
    "https://tjmaxx.tjx.com/store/index.jsp",
  );
  assert(
    productUrl.includes("Ntt=") && !productUrl.includes("index.jsp"),
    `TJ Maxx should use search URL, got ${productUrl}`,
  );

  const f21 = buildOfferClickUrl(
    "forever21",
    { ...item, title: "Sky Daisies Sweater" },
    intent,
  );
  assert(
    f21.productUrl.startsWith("https://www.forever21.com/search?"),
    `Forever 21 search path wrong: ${f21.productUrl}`,
  );

  const shein = buildOfferClickUrl(
    "shein",
    { ...item, title: "Sky Daisies Sweater" },
    intent,
  );
  assert(
    shein.productUrl.includes("keyword=Womens"),
    `SHEIN keyword missing: ${shein.productUrl}`,
  );
  assert(
    !shein.productUrl.includes("Various"),
    `SHEIN should not include Various brands: ${shein.productUrl}`,
  );

  console.log("✓ store link tests passed");
  console.log("  clean query:", q);
  console.log("  tjmaxx:", productUrl.slice(0, 80));
  console.log("  forever21:", f21.productUrl.slice(0, 80));
  console.log("  shein:", shein.productUrl.slice(0, 80));
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
