/**
 * Intent switch tests (sweaters → joggers should NOT merge).
 * Usage: node scripts/test-intent-switch.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const { register } = await import("tsx/esm/api").catch(() => ({ register: null }));
  if (register) register();

  const { isProductTypeSwitch, shouldMergeWithPreviousSearch } = await import(
    join(root, "src/lib/shopping/intent-merge.ts")
  );

  const session = {
    phase: "ready",
    intent: { query: "womens sweaters", zipCode: "78701" },
    asked: [],
    compareMode: false,
  };

  assert(
    isProductTypeSwitch("womens sweaters", "joggers"),
    "sweaters → joggers should be a product switch",
  );
  assert(
    !shouldMergeWithPreviousSearch("joggers", session),
    "joggers after sweaters should not merge",
  );
  assert(
    !shouldMergeWithPreviousSearch("mens joggers", session),
    "mens joggers after sweaters should not merge",
  );
  assert(
    !shouldMergeWithPreviousSearch("large blue joggers", session),
    "large blue joggers after sweaters should not merge",
  );
  assert(
    shouldMergeWithPreviousSearch("large", session),
    "size-only follow-up after sweaters should merge",
  );
  assert(
    isProductTypeSwitch("beds", "mattress"),
    "beds → mattress should be a switch",
  );
  assert(
    !isProductTypeSwitch("mens chinos", "joggers"),
    "chinos → joggers are compatible pants family",
  );

  console.log("✓ intent switch tests passed");
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
