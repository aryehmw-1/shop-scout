/** Strip natural-language prefixes so "find me mens pants" → "mens pants" */
const PREFIX_CHAIN =
  /^(?:please\s+)?(?:(?:can you|could you|will you)\s+)?(?:(?:help me|help)\s+)?(?:(?:find|get|show|search for|look for|shop for|buy|need|want)(?:\s+me)?)\s+(?:a|an|some|the)?\s*/i;

export function stripShoppingPrefixes(raw: string): string {
  let s = raw.trim();
  for (let i = 0; i < 4; i++) {
    const next = s.replace(PREFIX_CHAIN, "").trim();
    if (next === s) break;
    s = next;
  }
  return s || raw.trim();
}

/** Words that mean the user is shopping, not just chatting */
export const SHOPPING_KEYWORDS =
  /hoodie|hoody|shirt|pants|jeans|denim|chinos|shorts|dress|shoe|sneaker|boot|sandal|milk|egg|organic|grocery|book|mattress|sheet|comforter|jacket|polo|legging|toddler|baby|infant|\b(?:mens?|womens?|kids?|boys?|girls?)\b/i;

export function looksLikeShoppingQuery(text: string): boolean {
  const t = stripShoppingPrefixes(text);
  return SHOPPING_KEYWORDS.test(t) || t.split(/\s+/).length >= 2;
}
