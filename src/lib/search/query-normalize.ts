import { CATALOG } from "../retailers/catalog";

/** Simple Damerau-Levenshtein-lite: min edit distance (cap word length). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (Math.abs(m - n) > 3) return 99;

  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n]!;
}

const TYPO_MAP: Record<string, string> = {
  chiken: "chicken",
  chikcen: "chicken",
  jean: "jeans",
  jeens: "jeans",
  sneaker: "sneakers",
  hoody: "hoodie",
  tshirt: "t-shirt",
  tshrt: "t-shirt",
  womens: "women's",
  mens: "men's",
  tomatoe: "tomato",
  brocoli: "broccoli",
};

export function normalizeSearchQuery(raw: string): string {
  let q = raw
    .trim()
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [typo, fix] of Object.entries(TYPO_MAP)) {
    q = q.replace(new RegExp(`\\b${typo}\\b`, "g"), fix);
  }
  return q;
}

export interface CatalogSuggestHit {
  catalogId: string;
  title: string;
  brand: string;
  category: string;
  score: number;
}

/** Fuzzy catalog suggest for autocomplete (no external API). */
export function suggestCatalogProducts(query: string, limit = 8): CatalogSuggestHit[] {
  const q = normalizeSearchQuery(query);
  if (q.length < 2) return [];

  const tokens = q.split(/\s+/).filter(Boolean);
  const hits: CatalogSuggestHit[] = [];

  for (const item of CATALOG) {
    const hay = `${item.brand} ${item.title} ${item.keywords.join(" ")}`.toLowerCase();
    let score = 0;

    if (hay.startsWith(q)) score += 40;
    if (`${item.brand} ${item.title}`.toLowerCase().includes(q)) score += 30;

    for (const t of tokens) {
      if (hay.includes(t)) score += 12;
      else {
        const words = hay.split(/\s+/);
        for (const w of words) {
          if (w.startsWith(t)) score += 8;
          else if (editDistance(t, w) <= 1) score += 6;
        }
      }
    }

    if (score > 8) {
      hits.push({
        catalogId: item.id,
        title: item.title,
        brand: item.brand,
        category: item.category,
        score,
      });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const POPULAR_QUERIES = [
  "Boneless chicken breast",
  "Slim fit jeans",
  "Women's wide-leg pants",
  "Organic eggs",
  "Running shoes",
  "Greek yogurt",
];

export function suggestQueries(query: string, limit = 6): string[] {
  const q = normalizeSearchQuery(query);
  if (!q) return POPULAR_QUERIES.slice(0, limit);

  const fromPopular = POPULAR_QUERIES.filter((p) =>
    p.toLowerCase().includes(q),
  );
  const fromCatalog = suggestCatalogProducts(q, limit).map(
    (h) => `${h.brand} ${h.title}`.trim(),
  );

  return [...new Set([...fromPopular, ...fromCatalog])].slice(0, limit);
}
