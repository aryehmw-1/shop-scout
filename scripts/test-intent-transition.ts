/**
 * Intent transition regression tests — refine vs replace boundary management.
 * Usage: npm run test:intent
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  classifyIntentTransition,
  isProductTypeSwitch,
  mergeSearchIntent,
  shouldMergeWithPreviousSearch,
} from "../src/lib/shopping/intent-merge";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function session(query: string) {
  return {
    phase: "ready" as const,
    intent: { query, zipCode: "78701" },
    asked: [] as string[],
    compareMode: false,
  };
}

function main() {
  void root;

  const sweaterSession = session("womens sweaters");

  assert(
    isProductTypeSwitch("womens sweaters", "joggers"),
    "sweaters → joggers should be a product switch",
  );
  assert(
    !shouldMergeWithPreviousSearch("joggers", sweaterSession),
    "joggers after sweaters should not merge",
  );
  assert(
    !shouldMergeWithPreviousSearch("mens joggers", sweaterSession),
    "mens joggers after sweaters should not merge",
  );
  assert(
    !shouldMergeWithPreviousSearch("large blue joggers", sweaterSession),
    "large blue joggers after sweaters should not merge",
  );
  assert(
    shouldMergeWithPreviousSearch("large", sweaterSession),
    "size-only follow-up after sweaters should merge",
  );
  assert(isProductTypeSwitch("beds", "mattress"), "beds → mattress should be a switch");
  assert(
    !isProductTypeSwitch("mens chinos", "joggers"),
    "chinos → joggers are compatible pants family",
  );

  const coffeeSession = session("Folgers Breakfast Blend Ground Coffee");
  const chipsDecision = classifyIntentTransition(
    coffeeSession.intent.query,
    "Potato chips",
    coffeeSession,
  );
  assert(!chipsDecision.shouldMerge, "coffee → potato chips should NOT merge");
  assert(
    chipsDecision.action === "replace_current",
    `coffee → potato chips should replace, got ${chipsDecision.action}`,
  );
  assert(
    !shouldMergeWithPreviousSearch("Potato chips", coffeeSession),
    "shouldMergeWithPreviousSearch: coffee → potato chips",
  );
  const mergedCoffeeChips = mergeSearchIntent(coffeeSession.intent, "Potato chips");
  assert(
    !mergedCoffeeChips.query?.toLowerCase().includes("folgers"),
    `mergeSearchIntent must not contaminate: ${mergedCoffeeChips.query}`,
  );
  assert(
    mergedCoffeeChips.query?.toLowerCase().includes("chip"),
    `merged query should be chips-only: ${mergedCoffeeChips.query}`,
  );

  const milkSession = session("whole milk");
  const towelsDecision = classifyIntentTransition(
    milkSession.intent.query,
    "paper towels",
    milkSession,
  );
  assert(!towelsDecision.shouldMerge, "whole milk → paper towels should NOT merge");
  assert(
    !shouldMergeWithPreviousSearch("paper towels", milkSession),
    "shouldMergeWithPreviousSearch: whole milk → paper towels",
  );
  const mergedMilkTowels = mergeSearchIntent(milkSession.intent, "paper towels");
  assert(
    !mergedMilkTowels.query?.toLowerCase().includes("milk"),
    `must not merge milk into towels: ${mergedMilkTowels.query}`,
  );

  const pantsSession = session("mens pants");
  const joggersDecision = classifyIntentTransition(
    pantsSession.intent.query,
    "joggers",
    pantsSession,
  );
  assert(joggersDecision.shouldMerge, "mens pants → joggers should merge");
  assert(
    shouldMergeWithPreviousSearch("joggers", pantsSession),
    "shouldMergeWithPreviousSearch: mens pants → joggers",
  );
  const mergedPantsJoggers = mergeSearchIntent(pantsSession.intent, "joggers");
  assert(
    mergedPantsJoggers.query?.toLowerCase().includes("pants"),
    `should retain pants context: ${mergedPantsJoggers.query}`,
  );
  assert(
    mergedPantsJoggers.query?.toLowerCase().includes("jogger"),
    `should add joggers: ${mergedPantsJoggers.query}`,
  );

  const cerealDecision = classifyIntentTransition(
    pantsSession.intent.query,
    "cereal",
    pantsSession,
  );
  assert(!cerealDecision.shouldMerge, "mens pants → cereal should NOT merge");
  assert(
    !shouldMergeWithPreviousSearch("cereal", pantsSession),
    "shouldMergeWithPreviousSearch: mens pants → cereal",
  );

  const hoodieSession = session("nike hoodie");
  const sizeDecision = classifyIntentTransition(
    hoodieSession.intent.query,
    "size large",
    hoodieSession,
  );
  assert(sizeDecision.shouldMerge, "nike hoodie → size large should merge");
  assert(
    shouldMergeWithPreviousSearch("size large", hoodieSession),
    "shouldMergeWithPreviousSearch: nike hoodie → size large",
  );
  const mergedHoodieSize = mergeSearchIntent(hoodieSession.intent, "size large");
  assert(
    mergedHoodieSize.query?.toLowerCase().includes("hoodie"),
    `should keep hoodie: ${mergedHoodieSize.query}`,
  );
  assert(
    mergedHoodieSize.size === "large" ||
      mergedHoodieSize.size === "L" ||
      mergedHoodieSize.query?.toLowerCase().includes("large") ||
      mergedHoodieSize.query?.includes("L"),
    `should capture size: ${JSON.stringify(mergedHoodieSize)}`,
  );

  assert(
    shouldMergeWithPreviousSearch("black", hoodieSession),
    "color-only follow-up should merge",
  );
  assert(
    shouldMergeWithPreviousSearch("under 50", hoodieSession),
    "price constraint follow-up should merge",
  );

  console.log("✓ intent transition tests passed");
}

try {
  main();
} catch (e) {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
}
