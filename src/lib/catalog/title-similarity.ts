/** Token overlap + bigram Jaccard for lightweight title similarity (no embeddings). */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;

  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  const jaccard = union ? inter / union : 0;

  const bigA = bigrams(ta.join(" "));
  const bigB = bigrams(tb.join(" "));
  let bi = 0;
  for (const bg of bigA) {
    if (bigB.has(bg)) bi += 1;
  }
  const biUnion = new Set([...bigA, ...bigB]).size;
  const bigramScore = biUnion ? bi / biUnion : 0;

  return Math.min(1, jaccard * 0.65 + bigramScore * 0.35);
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "size",
  "mens",
  "womens",
  "men",
  "women",
]);

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  const compact = s.replace(/\s+/g, "");
  for (let i = 0; i < compact.length - 1; i++) {
    out.add(compact.slice(i, i + 2));
  }
  return out;
}
