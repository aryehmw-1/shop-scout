/** Parse budget constraints from natural language refinements. */
export function parseMaxPriceFromText(text: string): number | undefined {
  const t = text.trim().toLowerCase();
  const patterns = [
    /(?:under|below|less than|max|budget|up to)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:or less|max|maximum)/i,
    /(?:under|below)\s+\$?\s*(\d+)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

export function isPriceConstraintFollowUp(text: string): boolean {
  return parseMaxPriceFromText(text) !== undefined;
}
