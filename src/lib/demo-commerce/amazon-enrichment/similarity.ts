function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "pack",
  "size",
  "count",
  "ounce",
  "ounces",
  "organic",
]);

/** Jaccard similarity on title tokens (0–1). */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  const intersection = ta.filter((t) => setB.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union ? intersection / union : 0;
}

export function enrichmentConfidence(opts: {
  matchScore: number;
  hasImage: boolean;
  hasPdp: boolean;
  hasPrice: boolean;
}): number {
  let score = opts.matchScore * 0.55;
  if (opts.hasImage) score += 0.25;
  if (opts.hasPdp) score += 0.15;
  if (opts.hasPrice) score += 0.05;
  return Math.min(1, Math.round(score * 1000) / 1000);
}

/** Reject obvious unrelated Amazon results. */
export function isWeakAmazonMatch(
  candidateTitle: string,
  amazonTitle: string,
  matchScore: number,
): boolean {
  if (matchScore < 0.22) return true;
  const amazon = amazonTitle.toLowerCase();
  if (/case for|compatible with|replacement filter|refill only|digital code/i.test(amazon)) {
    return matchScore < 0.55;
  }
  const candTokens = tokenize(candidateTitle);
  if (candTokens.length >= 2) {
    const hits = candTokens.filter((t) => amazon.includes(t)).length;
    if (hits === 0) return true;
  }
  return false;
}
