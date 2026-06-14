// Deterministic query understanding for DB text retrieval. Turns a raw user
// query into a set of match tokens that tolerate singular/plural forms and common
// product synonyms, so "lamps" finds "lamp", "tvs" finds "television", and
// "couches" finds "sofa". This is NOT a spell-corrector — genuine misspellings
// ("airpod proo") are handled by the AI layer after submit; this is the fast,
// deterministic normalization that runs at query time against the catalog.

/** Words that carry no product signal — dropped from match tokens. */
const STOPWORDS = new Set([
  "a", "an", "the", "for", "with", "and", "or", "of", "to", "in", "on", "my",
  "me", "i", "cheap", "cheapest", "best", "good", "nice", "buy", "need", "want",
  "looking", "find", "some", "any", "new", "price", "prices", "deal", "deals",
  "under", "near",
  // Units / packaging / measure words — they coincidentally match scent names,
  // sizes, and pack counts across unrelated products ("spring water" vs "spring
  // water SCENT soap"), so they carry almost no product-identity signal.
  "fl", "oz", "ounce", "ounces", "ml", "l", "liter", "litre", "gal", "gallon",
  "lb", "lbs", "kg", "g", "gram", "grams", "ct", "count", "pack", "pk", "pkg",
  "box", "case", "size", "scent", "scented", "flavor", "flavored", "pcs", "piece",
  "pieces", "inch", "in", "cm", "mm", "qt", "quart", "pint",
]);

/** Is a token meaningless on its own (stopword or a pure number/measure)? */
function isWeakToken(t: string): boolean {
  return STOPWORDS.has(t) || /^\d+(\.\d+)?$/.test(t) || t.length < 2;
}

// High-precision product synonym groups only. Any token in a group expands to
// the rest. Deliberately tight: we avoid generic words (e.g. "light", "cup",
// "container") that would substring-match unrelated products. Singular/plural is
// handled separately by singularize(), so groups list singular forms.
const SYNONYM_GROUPS: string[][] = [
  ["tv", "television"],
  ["sofa", "couch", "loveseat", "sectional"],
  ["sneaker", "shoe", "trainers"],
  ["fridge", "refrigerator"],
  ["headphone", "earphone", "earbud"],
  ["airpod", "earbud"],
  ["pants", "trousers"],
  ["rug", "carpet"],
];

const SYNONYM_INDEX = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    const set = SYNONYM_INDEX.get(word) ?? new Set<string>();
    for (const w of group) set.add(w);
    SYNONYM_INDEX.set(word, set);
  }
}

/**
 * Best-effort English singularization. Handles the common regular plural forms;
 * conservative on purpose (returns the input unchanged when unsure) so we never
 * mangle a singular noun. We keep BOTH forms in the token set, so a wrong guess
 * just adds a harmless extra token.
 */
export function singularize(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 2) return w; // keep 2-letter tokens intact
  if (/(s|sh|ch|x|z)es$/.test(w)) return w.slice(0, -2); // boxes→box, dishes→dish, couches→couch
  if (/[^aeiou]ies$/.test(w)) return w.slice(0, -3) + "y"; // batteries→battery
  if (/ves$/.test(w)) return w.slice(0, -3) + "fe"; // knives→knife
  if (/[^s]s$/.test(w) && !w.endsWith("ss") && !w.endsWith("us")) return w.slice(0, -1); // lamps→lamp, tvs→tv
  return w;
}

/** Lowercased, de-duplicated CONTENT tokens (no stopwords, units, or numbers).
 *  These are the identity-bearing words used for relevance/coverage checks. */
export function baseTokens(query: string): string[] {
  const seen = new Set<string>();
  for (const t of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!isWeakToken(t)) seen.add(t);
  }
  return [...seen];
}

/**
 * Relevance gate: does `text` (a product's title/brand/keywords) genuinely cover
 * the query's CONTENT words? Uses WHOLE-WORD matching (so "water" doesn't match
 * "waterproof" and "spring" doesn't match "Spring Mix") and requires:
 *   - 1–2 content words  → ALL of them ("coffee maker" ≠ coffee TABLE)
 *   - 3+ content words   → at least half (tolerates extra descriptors)
 * This is the single guard that stops coincidental matches across the search.
 */
export function coversQuery(text: string, query: string): boolean {
  const content = baseTokens(query);
  if (!content.length) return true;
  const min = content.length <= 2 ? content.length : Math.ceil(content.length / 2);
  const words = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const hit = (t: string) =>
    words.has(t) || words.has(`${t}s`) || (t.endsWith("s") && words.has(t.slice(0, -1)));
  return content.filter(hit).length >= min;
}

/**
 * Expand a query into match tokens: each base token plus its singular form plus
 * any synonyms. Capped so very long queries don't explode the OR clause.
 */
export function expandQueryTokens(query: string, cap = 24): string[] {
  const out = new Set<string>();
  for (const tok of baseTokens(query)) {
    out.add(tok);
    const sing = singularize(tok);
    if (sing && sing.length >= 2) out.add(sing);
    for (const key of [tok, sing]) {
      const syns = SYNONYM_INDEX.get(key);
      if (syns) for (const s of syns) out.add(s);
    }
  }
  return [...out].slice(0, cap);
}
