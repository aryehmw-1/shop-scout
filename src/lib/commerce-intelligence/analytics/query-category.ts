/** Privacy-safe coarse query buckets — no raw query stored in analytics by default. */
export function inferQueryCategory(query: string): string {
  const q = query.toLowerCase();
  if (/\b(shoe|sneaker|boot|sandal)\b/.test(q)) return "footwear";
  if (/\b(shirt|pants|jeans|dress|hoodie|jacket)\b/.test(q)) return "apparel";
  if (/\b(coffee|milk|grocery|organic|snack)\b/.test(q)) return "grocery";
  if (/\b(phone|laptop|tablet|headphone)\b/.test(q)) return "electronics";
  if (/\b(book|novel|kindle)\b/.test(q)) return "books";
  if (/\b(mattress|sofa|bed|pillow)\b/.test(q)) return "home";
  if (q.length < 4) return "ambiguous_short";
  return "general";
}
