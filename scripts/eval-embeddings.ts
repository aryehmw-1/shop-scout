#!/usr/bin/env tsx
/**
 * P4 — Embeddings evaluation harness (SHADOW; never changes production ranking).
 *
 * Drives the local embedder and (when OPENAI_API_KEY is set) the OpenAI embedder
 * over a labeled benchmark, and reports, per dimension:
 *   - retrieval accuracy   (P@1, MRR over relevant vs distractors)
 *   - typo handling        (typo'd query still ranks the right product first)
 *   - similar-product      (near-substitutes rank above unrelated items)
 *   - category understanding (query ranks in-category items above out-of-category)
 *   - semantic matching    (paraphrase / no-shared-word query still matches)
 *   - average latency per embed call
 *   - estimated cost per 1k queries
 *
 * SAFE TO RUN WITHOUT A KEY: local-only by default (zero cost). To include OpenAI
 * (small real cost, ~$0.0001 for the whole benchmark), run with the key set:
 *   OPENAI_API_KEY=sk-... EMBEDDINGS_PROVIDER=openai \
 *     npx tsx --conditions=react-server scripts/eval-embeddings.ts
 */
import { loadEnv } from "./load-env.mjs";
loadEnv();

import { evalEmbedders } from "../src/lib/search/embeddings-shadow";

type Embedder = typeof evalEmbedders.local;
const { cosine, MODEL_COST_PER_1K } = evalEmbedders;

interface Case {
  dimension: "retrieval" | "typo" | "similar" | "category" | "semantic";
  query: string;
  /** The single correct/best item the query should rank first. */
  relevant: string;
  /** Decoys that must rank BELOW the relevant item. */
  distractors: string[];
}

// Hand-labeled benchmark. Items are written as they'd appear as product titles.
const BENCH: Case[] = [
  // --- retrieval accuracy: exact/near-exact product lookup ---
  { dimension: "retrieval", query: "Bounty paper towels", relevant: "Bounty Select-A-Size Paper Towels",
    distractors: ["Charmin Ultra Soft Toilet Paper", "Dawn Ultra Dish Soap", "Glad Trash Bags 13 Gallon"] },
  { dimension: "retrieval", query: "Tide Pods laundry detergent", relevant: "Tide PODS Laundry Detergent Pacs",
    distractors: ["Gain Liquid Fabric Softener", "Bounce Dryer Sheets", "Clorox Disinfecting Wipes"] },
  { dimension: "retrieval", query: "Dawn dish soap", relevant: "Dawn Ultra Liquid Dish Soap Original",
    distractors: ["Cascade Dishwasher Pods", "Palmolive Bar Soap", "Method Hand Wash"] },

  // --- typo handling ---
  { dimension: "typo", query: "papertowels", relevant: "Bounty Select-A-Size Paper Towels",
    distractors: ["Charmin Ultra Soft Toilet Paper", "Reynolds Aluminum Foil", "Hefty Trash Bags"] },
  { dimension: "typo", query: "detergnt", relevant: "Tide Liquid Laundry Detergent",
    distractors: ["Febreze Air Freshener", "Windex Glass Cleaner", "Lysol Toilet Bowl Cleaner"] },
  { dimension: "typo", query: "tiolet papr", relevant: "Charmin Ultra Soft Toilet Paper",
    distractors: ["Bounty Paper Towels", "Scott Shop Towels", "Kleenex Facial Tissues"] },

  // --- similar-product quality (near substitutes above unrelated) ---
  { dimension: "similar", query: "Bounty paper towels", relevant: "Sparkle Pick-A-Size Paper Towels",
    distractors: ["Energizer AA Batteries", "Colgate Toothpaste", "Maxwell House Coffee"] },
  { dimension: "similar", query: "Dawn dish soap", relevant: "Palmolive Ultra Dish Liquid",
    distractors: ["Tide Laundry Detergent", "Charmin Toilet Paper", "Ziploc Storage Bags"] },

  // --- category understanding ---
  { dimension: "category", query: "cleaning supplies", relevant: "Clorox Disinfecting Wipes",
    distractors: ["Honey Nut Cheerios Cereal", "Gatorade Sports Drink", "Hanes Crew Socks"] },
  { dimension: "category", query: "baby supplies", relevant: "Pampers Swaddlers Diapers Size 2",
    distractors: ["DeWalt Cordless Drill", "Folgers Ground Coffee", "Sharpie Permanent Markers"] },

  // --- semantic matching (no shared word / paraphrase) ---
  { dimension: "semantic", query: "something to wash dishes with", relevant: "Dawn Ultra Liquid Dish Soap",
    distractors: ["Tide Laundry Detergent Pods", "Reynolds Aluminum Foil", "Bounty Paper Towels"] },
  { dimension: "semantic", query: "wipe up kitchen spills", relevant: "Bounty Select-A-Size Paper Towels",
    distractors: ["Charmin Toilet Paper", "Cascade Dishwasher Detergent", "Hefty Trash Bags"] },
  { dimension: "semantic", query: "keep food fresh in the fridge", relevant: "Ziploc Gallon Storage Bags",
    distractors: ["Windex Glass Cleaner", "Tide Pods", "Sparkle Paper Towels"] },
];

async function rankFor(emb: Embedder, q: string, items: string[]): Promise<{ order: string[]; latencyMs: number; tokens: number; model: string } | null> {
  const t0 = Date.now();
  const qv = await emb(q);
  if (!qv) return null;
  let tokens = qv.tokensEst;
  const scored: { item: string; sim: number }[] = [];
  for (const it of items) {
    const v = await emb(it);
    if (!v) return null;
    tokens += v.tokensEst;
    scored.push({ item: it, sim: cosine(qv.vector, v.vector) });
  }
  scored.sort((a, b) => b.sim - a.sim);
  return { order: scored.map((s) => s.item), latencyMs: Date.now() - t0, tokens, model: qv.model };
}

async function evaluate(name: string, emb: Embedder) {
  const byDim: Record<string, { n: number; p1: number; mrrSum: number }> = {};
  let totalLatency = 0, totalTokens = 0, calls = 0, model = "";
  for (const c of BENCH) {
    const items = [c.relevant, ...c.distractors];
    const r = await rankFor(emb, c.query, items);
    if (!r) { console.log(`  [${name}] SKIPPED (embedder returned null — no key?)`); return null; }
    model = r.model;
    totalLatency += r.latencyMs; totalTokens += r.tokens; calls += items.length + 1;
    const rank = r.order.indexOf(c.relevant) + 1; // 1-based
    const d = (byDim[c.dimension] ??= { n: 0, p1: 0, mrrSum: 0 });
    d.n++; d.p1 += rank === 1 ? 1 : 0; d.mrrSum += 1 / rank;
  }
  const costPer1k = MODEL_COST_PER_1K[model] ?? 0;
  return { name, model, byDim, avgLatencyMs: totalLatency / BENCH.length, avgEmbedMs: totalLatency / calls, costPer1kQueries: costPer1k * (totalTokens / BENCH.length) }; // cost to embed 1k queries' worth
}

function fmtTable(res: NonNullable<Awaited<ReturnType<typeof evaluate>>>) {
  console.log(`\n=== ${res.name}  (model: ${res.model}) ===`);
  const dims = ["retrieval", "typo", "similar", "category", "semantic"];
  for (const dim of dims) {
    const d = res.byDim[dim];
    if (!d) continue;
    console.log(`  ${dim.padEnd(10)}  P@1 ${(d.p1 / d.n * 100).toFixed(0).padStart(3)}%   MRR ${(d.mrrSum / d.n).toFixed(3)}   (n=${d.n})`);
  }
  const all = Object.values(res.byDim).reduce((a, d) => ({ n: a.n + d.n, p1: a.p1 + d.p1, mrr: a.mrr + d.mrrSum }), { n: 0, p1: 0, mrr: 0 });
  console.log(`  ${"OVERALL".padEnd(10)}  P@1 ${(all.p1 / all.n * 100).toFixed(0).padStart(3)}%   MRR ${(all.mrr / all.n).toFixed(3)}   (n=${all.n})`);
  console.log(`  latency: ${res.avgEmbedMs.toFixed(1)}ms/embed   cost: $${res.costPer1kQueries.toFixed(5)} per 1k queries`);
}

async function main() {
  console.log("P4 — Embeddings evaluation (local vs OpenAI). SHADOW; no production ranking change.");
  console.log(`Benchmark: ${BENCH.length} labeled cases across 5 dimensions.\n`);

  const local = await evaluate("LOCAL (shadow-stub)", evalEmbedders.local);
  if (local) fmtTable(local);

  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (!hasKey) {
    console.log("\n=== OPENAI: skipped (no OPENAI_API_KEY) ===");
    console.log("  Re-run with OPENAI_API_KEY set to compare. Whole benchmark costs ~$0.0001.");
  } else {
    const openai = await evaluate("OPENAI (text-embedding-3-small)", evalEmbedders.openai);
    if (openai) fmtTable(openai);
    if (local && openai) {
      const o = (r: typeof openai) => Object.values(r.byDim).reduce((a, d) => ({ p1: a.p1 + d.p1, n: a.n + d.n }), { p1: 0, n: 0 });
      const lo = o(local), oo = o(openai);
      const delta = (oo.p1 / oo.n - lo.p1 / lo.n) * 100;
      console.log(`\n=== VERDICT ===`);
      console.log(`  OpenAI P@1 ${(delta >= 0 ? "+" : "")}${delta.toFixed(0)} pts vs local.`);
      console.log(`  Recommendation: ${delta >= 15 ? "ENABLE OpenAI — materially better." : delta >= 5 ? "MARGINAL — weigh cost/latency." : "KEEP LOCAL — no material gain."}`);
    }
  }
  console.log("\nNote: the 'local' embedder is a deterministic char-hash STUB, not a trained");
  console.log("semantic model — so its semantic/typo scores reflect that. A fair 'local'");
  console.log("comparison would wire a real on-device model (e.g. all-MiniLM via");
  console.log("transformers.js); until then OpenAI is the only true semantic option.");
}

main().catch((e) => { console.error(e); process.exit(1); });
