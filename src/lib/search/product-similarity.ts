import { scoreItem, tokenizeQuery } from "../retailers/search";
import type { CatalogItem } from "../retailers/catalog";
import type { ShoppingIntent } from "../types";

/** Synonym groups — tokens in the same group count as related. */
const SYNONYM_GROUPS: string[][] = [
  ["hoodie", "hoody", "sweatshirt", "pullover", "fleece"],
  ["jeans", "denim"],
  ["chinos", "khakis", "trousers", "slacks", "dress", "pants"],
  ["joggers", "jogger", "sweatpants", "track"],
  ["sneaker", "sneakers", "trainer", "trainers", "running"],
  ["shoe", "shoes", "footwear"],
  ["boot", "boots"],
  ["sandal", "sandals"],
  ["shirt", "tee", "tshirt", "top"],
  ["jacket", "coat", "outerwear"],
  ["mattress", "bed"],
  ["pretzel", "snack"],
];

const SYNONYM_INDEX = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  const set = new Set(group);
  for (const w of group) SYNONYM_INDEX.set(w, set);
}

function expandToken(token: string): Set<string> {
  const base = new Set([token]);
  const syn = SYNONYM_INDEX.get(token);
  if (syn) syn.forEach((s) => base.add(s));
  return base;
}

function tokenOverlapScore(queryTokens: string[], itemBlob: string): number {
  let score = 0;
  for (const t of queryTokens) {
    const variants = expandToken(t);
    for (const v of variants) {
      if (itemBlob.includes(v)) {
        score += v === t ? 10 : 6;
        break;
      }
    }
  }
  return score;
}

export function similarityScore(
  item: CatalogItem,
  query: string,
  intent?: Partial<ShoppingIntent>,
): number {
  const blob = `${item.title} ${item.brand} ${item.keywords.join(" ")}`.toLowerCase();
  const tokens = tokenizeQuery(query);
  let score = tokenOverlapScore(tokens, blob);

  const fullIntent: ShoppingIntent = {
    query,
    ...intent,
  };
  score += scoreItem(item, fullIntent) * 0.35;

  if (intent?.productSubtype) {
    const sub = intent.productSubtype.replace(/_/g, " ");
    if (blob.includes(sub) || item.keywords.some((k) => k.includes(sub))) {
      score += 25;
    }
  }

  const q = query.toLowerCase();
  if (q.length > 4 && blob.includes(q)) score += 40;

  return score;
}

export function rankSimilarCatalogItems(
  anchorId: string,
  query: string,
  items: CatalogItem[],
  intent?: Partial<ShoppingIntent>,
  limit = 4,
): CatalogItem[] {
  return items
    .filter((i) => i.id !== anchorId)
    .map((item) => ({ item, score: similarityScore(item, query, intent) }))
    .filter(({ score }) => score >= 14)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}
