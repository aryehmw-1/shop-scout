import { isGenericBrandToken } from "../shopping/product-display";
import type { ShoppingIntent } from "../types";

const NOISE_TERMS =
  /\b(various brands?|1 unit|see store|women'?s? sweaters?|men'?s? sweaters?)\b/gi;

export function cleanStoreSearchTerms(raw: string): string {
  return raw.replace(NOISE_TERMS, "").replace(/\s+/g, " ").trim();
}

function queryCoversTitle(query: string, title: string): boolean {
  const q = query.toLowerCase();
  const words = title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (!words.length) return true;
  const hits = words.filter((w) => q.includes(w)).length;
  return hits / words.length >= 0.55;
}

/**
 * Short, store-friendly search string — never stack user query + brand + full catalog title.
 */
export function buildStoreSearchQuery(
  item: { brand: string; title: string; size: string },
  intent?: ShoppingIntent,
): string {
  const intentQ = cleanStoreSearchTerms(intent?.query ?? "");

  if (intentQ.length >= 4) {
    const title = cleanStoreSearchTerms(item.title);
    if (!title || queryCoversTitle(intentQ, title)) {
      return intentQ.slice(0, 72);
    }
    if (intentQ.split(/\s+/).length <= 4) {
      return cleanStoreSearchTerms(`${intentQ} ${title}`).slice(0, 72);
    }
    return intentQ.slice(0, 72);
  }

  const brand =
    item.brand && !isGenericBrandToken(item.brand) ?
      cleanStoreSearchTerms(item.brand)
    : "";
  const title = cleanStoreSearchTerms(item.title);
  const size = item.size && item.size !== "1 unit" ? item.size : "";

  return cleanStoreSearchTerms([brand, title, size].filter(Boolean).join(" "))
    .slice(0, 72);
}
