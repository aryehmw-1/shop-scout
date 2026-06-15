// PHASE 2 — Candidate-only semantic embeddings, SHADOW MODE ONLY.
//
// This module observes; it never decides. Given a user query and the already-
// filtered candidate offers, it (optionally) embeds the query + candidates,
// computes what an embedding-similarity reranking WOULD be, and logs the
// divergence from today's price/coverage ordering — without ever changing the
// order returned to users. Production ranking is untouched until we review the
// logged results and explicitly promote this out of shadow mode.
//
// Safety properties:
//  • OFF by default — runs only when EMBEDDINGS_SHADOW=1.
//  • Kill switch — EMBEDDINGS_KILL=1 forces OFF even if the flag is on.
//  • Candidate-only — embeds at most SHADOW_MAX_CANDIDATES already-matched
//    candidates, never the whole catalog.
//  • Zero production impact — the runner is fire-and-forget and returns void;
//    callers must NOT await it on the request path, and it swallows all errors.
//  • Cost + latency logging — every run logs candidate count, wall-clock ms,
//    estimated tokens, and estimated USD so we can size a real rollout.

import type { ProductOffer } from "@/lib/types";

/** Hard cap on candidates embedded per query — bounds cost/latency in shadow. */
const SHADOW_MAX_CANDIDATES = 10;

/** Result of one embedding call, with what we need for cost accounting. */
interface EmbedResult {
  vector: number[];
  model: string;
  /** Rough token estimate (~4 chars/token) for cost logging. */
  tokensEst: number;
}

/** A text → vector embedder. Swappable: the default is a local, zero-cost
 *  deterministic stub so Phase 2 can start without an external dependency or
 *  spend. Wiring a real model (e.g. Gemini/OpenAI) is a single-function change;
 *  set its per-1k-token price in MODEL_COST_PER_1K below. */
type Embedder = (text: string) => Promise<EmbedResult | null>;

/** USD per 1k tokens, by model. Stub is free; add real models when wired. */
const MODEL_COST_PER_1K: Record<string, number> = {
  "shadow-stub-v1": 0,
};

/** Deterministic local embedding — schema-faithful, no network, no cost.
 *  Replace with a real provider call when promoting past shadow. */
const localStubEmbedder: Embedder = async (text) => {
  const fingerprint = text.trim().toLowerCase().slice(0, 512);
  if (!fingerprint) return null;
  const dims = 32;
  const vector = Array.from({ length: dims }, (_, i) => {
    // Cheap, stable hash-ish projection — good enough to exercise the pipeline.
    let h = 0;
    for (let j = i; j < fingerprint.length; j += dims) {
      h = (h * 31 + fingerprint.charCodeAt(j)) % 1000;
    }
    return (h % 200) / 100 - 1; // [-1, 1)
  });
  return { vector, model: "shadow-stub-v1", tokensEst: Math.ceil(fingerprint.length / 4) };
};

let embedder: Embedder = localStubEmbedder;

/** Test/seam hook — swap the embedder (e.g. to a real model) without touching
 *  callers. Not used on the request path. */
export function __setEmbedderForTesting(next: Embedder) {
  embedder = next;
}

/** Feature flag + kill switch. The kill switch wins. */
export function isEmbeddingShadowEnabled(): boolean {
  if (process.env.EMBEDDINGS_KILL === "1") return false;
  return process.env.EMBEDDINGS_SHADOW === "1";
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function offerText(o: ProductOffer): string {
  return `${o.brand ?? ""} ${o.storeTitle ?? o.title}`.trim();
}

/** Spearman-ish divergence: how many of the top-N candidates change position
 *  between the current (price/coverage) order and the embedding order. */
function rankDivergence(currentIds: string[], shadowIds: string[]): number {
  const top = Math.min(currentIds.length, shadowIds.length);
  let moved = 0;
  for (let i = 0; i < top; i++) {
    if (currentIds[i] !== shadowIds[i]) moved++;
  }
  return moved;
}

/**
 * Run the embedding shadow for one query's candidate set. Fire-and-forget:
 * returns void, never throws, and MUST NOT be awaited on the request path.
 * Does nothing unless the flag is on (and the kill switch is off).
 */
export function runEmbeddingShadow(
  query: string,
  candidates: ProductOffer[],
): void {
  if (!isEmbeddingShadowEnabled()) return;
  if (!query.trim() || candidates.length < 2) return;

  // Detach from the caller; swallow everything.
  void (async () => {
    const started = Date.now();
    const pool = candidates.slice(0, SHADOW_MAX_CANDIDATES);
    try {
      const queryEmb = await embedder(query);
      if (!queryEmb) return;

      let tokens = queryEmb.tokensEst;
      const scored: { id: string; sim: number }[] = [];
      for (const offer of pool) {
        const emb = await embedder(offerText(offer));
        if (!emb) continue;
        tokens += emb.tokensEst;
        scored.push({ id: offer.id, sim: cosine(queryEmb.vector, emb.vector) });
      }
      if (!scored.length) return;

      const currentIds = pool.map((o) => o.id);
      const shadowIds = [...scored].sort((a, b) => b.sim - a.sim).map((s) => s.id);
      const moved = rankDivergence(currentIds, shadowIds);
      const costPer1k = MODEL_COST_PER_1K[queryEmb.model] ?? 0;
      const estCostUsd = (tokens / 1000) * costPer1k;

      console.log("[embeddings-shadow] observed (no ranking change)", {
        query: query.slice(0, 80),
        model: queryEmb.model,
        candidates: pool.length,
        latencyMs: Date.now() - started,
        tokensEst: tokens,
        estCostUsd: Number(estCostUsd.toFixed(6)),
        rankMoved: moved,
        topCurrent: currentIds.slice(0, 3),
        topShadow: shadowIds.slice(0, 3),
      });
    } catch (err) {
      // Never let the shadow affect the request — log and move on.
      console.error("[embeddings-shadow] run failed (ignored)", {
        query: query.slice(0, 80),
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}
