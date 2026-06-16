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

/**
 * Synonym-aware coverage — same thresholds as {@link coversQuery} (1–2 words → all,
 * 3+ → at least half) but a query word also counts as covered by its singular form
 * or a known synonym. Used as the catalog-match relevance FLOOR so "fridge" still
 * matches a product titled "Refrigerator", while a weak lookalike that shares no
 * content word ("car trash bag" vs a snack) is still rejected.
 */
export function coversQueryExpanded(text: string, query: string): boolean {
  const content = baseTokens(query);
  if (!content.length) return true;
  const min = content.length <= 2 ? content.length : Math.ceil(content.length / 2);
  const words = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const covers = (t: string): boolean => {
    const sing = singularize(t);
    if (words.has(t) || words.has(`${t}s`) || words.has(sing)) return true;
    if (t.endsWith("s") && words.has(t.slice(0, -1))) return true;
    const syn = SYNONYM_INDEX.get(t) ?? SYNONYM_INDEX.get(sing);
    if (syn) for (const s of syn) if (words.has(s) || words.has(`${s}s`)) return true;
    return false;
  };
  return content.filter(covers).length >= min;
}

/**
 * Similar-alternative gate: does a candidate product share at least one CONTENT
 * word with the user's QUERY (whole-word, singular/plural + synonym aware)?
 *
 * This is the strong category/relevance guard for "Similar alternatives": a car
 * trash bag must never surface cheese crackers, an air fryer must never surface a
 * charger. We deliberately gate on the user's own query (not a possibly-wrong
 * matched product), and return `false` for an empty query so the UI shows
 * "no relevant alternatives" rather than random noise.
 */
export function sharesContentWord(query: string, candidateText: string): boolean {
  const q = new Set(expandQueryTokens(query));
  if (!q.size) return false;
  for (const w of baseTokens(candidateText)) {
    if (q.has(w) || q.has(singularize(w))) return true;
  }
  return false;
}

/** A query is "short" (1–2 content words) — the regime where a single word
 *  appearing anywhere in a long title creates false matches. */
export function isShortQuery(query: string): boolean {
  const n = baseTokens(query).length;
  return n > 0 && n <= 2;
}

/** Spec/qualifier tokens that are never the product's head noun — stripped so we
 *  can find the real type word (e.g. "Whirlpool Refrigerator 25 cu ft" → fridge,
 *  "Ninja Air Fryer Max XL" → fryer). Numbers are dropped separately. */
const HEAD_SPEC = new Set([
  "cu", "ft", "w", "watt", "watts", "v", "hz", "lb", "lbs", "kg", "mah", "mm",
  "qt", "gal", "pcs", "pc", "ct", "pk", "set", "max", "xl", "xxl", "plus", "pro",
  "mini", "new", "digital", "large", "small", "compact", "portable", "reusable",
  "premium", "deluxe",
]);

/** Core content tokens (specs/numbers removed), in title order. */
function coreTokens(text: string): string[] {
  return baseTokens(text).filter((t) => !HEAD_SPEC.has(t) && !/^\d/.test(t));
}

/** The product's HEAD REGION — the last ~2 core tokens, where English names the
 *  product type. "LED Refrigerator Light Bulb" → [light, bulb]; "Air Fryer Oven"
 *  → [fryer, oven]; "Whirlpool Refrigerator" → [whirlpool, refrigerator]. */
function headRegion(text: string): string[] {
  const core = coreTokens(text);
  return core.slice(-2);
}

/**
 * HEAD-NOUN gate for short queries. "refrigerator" must match a product whose
 * TYPE is a refrigerator (head region or category) — NOT a juice bottle that says
 * "refrigerator-safe" nor a "refrigerator light bulb" where refrigerator is just a
 * front modifier (head region is [light, bulb]). Synonym-aware.
 */
export function matchesAsHeadTerm(query: string, titleText: string, category?: string): boolean {
  const q = new Set(expandQueryTokens(query));
  if (!q.size) return false;
  const region = [...headRegion(titleText), ...(category ? baseTokens(category) : [])];
  for (const w of region) {
    if (q.has(w) || q.has(singularize(w))) return true;
  }
  return false;
}

/**
 * Type-coherence gate for similar/broadened fallbacks: does a candidate share the
 * QUERY's product TYPE (its head noun)? "Ninja Air Fryer Max XL" (type = fryer)
 * matches other air fryers but not a Ninja blender; "refrigerator" matches real
 * fridges but not a refrigerator light bulb. Returns false when the query has no
 * clear head noun.
 */
export function sharesProductType(query: string, candidateText: string, category?: string): boolean {
  const qCore = coreTokens(query);
  const qHead = qCore[qCore.length - 1];
  if (!qHead) return false;
  const variants = new Set<string>([qHead, singularize(qHead)]);
  const syn = SYNONYM_INDEX.get(qHead) ?? SYNONYM_INDEX.get(singularize(qHead));
  if (syn) for (const s of syn) variants.add(s);
  // Candidate must name this TYPE as its STRICT head noun (last core token) or in
  // its category — not merely mention it somewhere (a "cleaner for refrigerator"
  // ends in a different head and is correctly rejected).
  const cCore = coreTokens(candidateText);
  const cHead = cCore[cCore.length - 1];
  if (cHead && (variants.has(cHead) || variants.has(singularize(cHead)))) return true;
  if (category) {
    for (const w of baseTokens(category)) {
      if (variants.has(w) || variants.has(singularize(w))) return true;
    }
  }
  return false;
}
