/** Parse USD from retailer JSON/HTML fragments. */
export function parsePriceUsd(raw: unknown): number | undefined {
  if (typeof raw === "number" && raw > 0) {
    // Target sometimes uses cents in integer fields > 1000
    const usd = raw >= 1000 && Number.isInteger(raw) ? raw / 100 : raw;
    if (usd > 0 && usd < 1_000_000) return Math.round(usd * 100) / 100;
  }
  if (typeof raw === "string") {
    const m = raw.replace(/,/g, "").match(/\$?\s*([\d]+(?:\.\d{2})?)/);
    if (!m) return undefined;
    const n = parseFloat(m[1]!);
    if (Number.isFinite(n) && n > 0 && n < 1_000_000) {
      return Math.round(n * 100) / 100;
    }
  }
  return undefined;
}

export function parsePriceFromText(html: string): number | undefined {
  const patterns = [
    /class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /"currentPrice"\s*:\s*\{[^}]*"price"\s*:\s*([\d.]+)/i,
    /"currentPrice"\s*:\s*([\d.]+)/i,
    /"current_retail"\s*:\s*([\d.]+)/i,
    /"formatted_current_price"\s*:\s*"\$?([\d,]+(?:\.\d{2})?)"/i,
    /"offerPrice"\s*:\s*([\d.]+)/i,
    /"linePrice"\s*:\s*"\$?([\d,]+(?:\.\d{2})?)"/i,
  ];
  const found: number[] = [];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    const n = parsePriceUsd(m[1]);
    if (n) found.push(n);
  }
  return found.length ? Math.min(...found) : undefined;
}
