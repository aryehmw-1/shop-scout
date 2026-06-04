import type { RetailerSearchHit } from "../../src/lib/offers/retailer-adapters/types";
import { getRetailerAdapter } from "../../src/lib/offers/retailer-adapters";
import type { RetailerId } from "../../src/lib/types";
import { parsePrice } from "./parse";

/** Extract multiple product hits from one search results page. */
export function extractManySearchHits(
  html: string,
  pageUrl: string,
  retailer: string,
): RetailerSearchHit[] {
  const adapter = getRetailerAdapter(retailer as RetailerId);
  const primary = adapter?.extractSearchResults(html, pageUrl);
  const hits: RetailerSearchHit[] = primary ? [primary] : [];
  const seen = new Set<string>();

  const add = (hit: RetailerSearchHit | null) => {
    if (!hit?.pdpUrl) return;
    const key = hit.pdpUrl.split("?")[0]!.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(hit);
  };

  if (retailer === "walmart") {
    for (const m of html.matchAll(/"usItemId"\s*:\s*"(\d+)"/g)) {
      const id = m[1]!;
      const window = html.slice(Math.max(0, (m.index ?? 0) - 400), (m.index ?? 0) + 1200);
      const name = window.match(/"name"\s*:\s*"([^"\\]+)"/)?.[1];
      const thumb = window.match(/"thumbnailUrl"\s*:\s*"([^"\\]+)"/)?.[1];
      const price = parsePrice(
        window.match(/"price"\s*:\s*([\d.]+)/)?.[1] ??
          window.match(/"currentPrice"\s*:\s*\{\s*"price"\s*:\s*([\d.]+)/)?.[1],
      );
      add({
        pdpUrl: `https://www.walmart.com/ip/${id}`,
        storeTitle: name,
        imageUrl: thumb?.replace(/\\u002F/g, "/"),
        priceUsd: price ?? undefined,
        externalId: id,
        fromSearchParser: true,
      });
    }
  }

  if (retailer === "target") {
    for (const m of html.matchAll(/\/p\/[^"']+\/A-(\d+)/g)) {
      const tcin = m[1]!;
      const pdpUrl = `https://www.target.com/p/-/A-${tcin}`;
      const window = html.slice(Math.max(0, (m.index ?? 0) - 300), (m.index ?? 0) + 800);
      const title = window.match(/"product_description"\s*:\s*\{\s*"title"\s*:\s*"([^"\\]+)"/)?.[1]
        ?? window.match(/"title"\s*:\s*"([^"\\]+)"/)?.[1];
      const img = window.match(/"image_url"\s*:\s*"([^"\\]+)"/)?.[1];
      const price = parsePrice(window.match(/"current_retail"\s*:\s*([\d.]+)/)?.[1]);
      add({
        pdpUrl,
        storeTitle: title,
        imageUrl: img?.replace(/\\u002F/g, "/"),
        priceUsd: price ?? undefined,
        externalId: tcin,
        fromSearchParser: true,
      });
    }
  }

  if (retailer === "amazon") {
    for (const m of html.matchAll(/\/dp\/([A-Z0-9]{10})/g)) {
      const asin = m[1]!;
      add({
        pdpUrl: `https://www.amazon.com/dp/${asin}`,
        externalId: asin,
        fromSearchParser: true,
      });
    }
  }

  return hits.slice(0, 20);
}
