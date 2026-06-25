/** Strip natural-language prefixes so "I want to find beats" → "beats",
 *  "looking for an air fryer" → "air fryer", "find me mens pants" → "mens pants". */
const PREFIX_CHAIN =
  /^(?:please\s+)?(?:i(?:'m|\s+am)?\s+)?(?:(?:would|just|really)\s+)?(?:(?:can|could|will|would)\s+you\s+)?(?:(?:like|want|wanna|wish|need|trying|looking|hoping|searching|shopping|help(?:\s+me)?)\s+)?(?:(?:to|for)\s+)?(?:(?:find|get|show|search|look|shop|buy|need|want|locate|source|grab|order)(?:\s+(?:me|for))?\s+)?(?:(?:an|a|some|the)\s+)?/i;

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
  /hoodie|hoody|shirt|sweater|cardigan|joggers?|pants|jeans|denim|chinos|shorts|dress|shoe|sneaker|boot|sandal|milk|egg|organic|grocery|book|mattress|bed|beds|bedding|sheet|comforter|jacket|polo|legging|toddler|baby|infant|\b(?:mens?|womens?|kids?|boys?|girls?)\b/i;

export function looksLikeShoppingQuery(text: string): boolean {
  const t = stripShoppingPrefixes(text);
  return SHOPPING_KEYWORDS.test(t) || t.split(/\s+/).length >= 2;
}
