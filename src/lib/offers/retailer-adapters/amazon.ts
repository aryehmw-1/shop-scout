import type { CatalogItem } from "../../retailers/catalog";
import type { ShoppingIntent } from "../../types";
import type { RetailerPageAdapter, RetailerSearchHit } from "./types";
import { pickBestAmazonHitByCatalog } from "../amazon-validation";
import { parsePriceFromText, parsePriceUsd } from "./price-parse";

const ASIN_RE = /data-asin=["']([A-Z0-9]{10})["']/gi;

function amazonPdpUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}`;
}

function extractAmazonSearchHits(html: string): RetailerSearchHit[] {
  const hits: RetailerSearchHit[] = [];
  const asins: string[] = [];
  let match: RegExpExecArray | null;
  ASIN_RE.lastIndex = 0;
  while ((match = ASIN_RE.exec(html)) !== null) {
    const asin = match[1]!;
    if (asin === "0000000000" || asins.includes(asin)) continue;
    asins.push(asin);
  }

  for (const asin of asins.slice(0, 8)) {
    const idx = html.indexOf(`data-asin="${asin}"`);
    const chunk = idx >= 0 ? html.slice(idx, idx + 9000) : html.slice(0, 9000);
    const title =
      chunk.match(/<span[^>]+class=["'][^"']*a-text-normal[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]
        ?.replace(/<[^>]+>/g, "")
        .trim() ??
      chunk.match(/"title"\s*:\s*"([^"\\]+)"/)?.[1];

    const priceUsd =
      parsePriceFromText(chunk) ??
      parsePriceUsd(chunk.match(/"priceAmount"\s*:\s*([\d.]+)/)?.[1]);

    const imageUrl =
      chunk.match(/src=["'](https:\/\/m\.media-amazon\.com\/images\/[^"']+)["']/i)?.[1];

    hits.push({
      pdpUrl: amazonPdpUrl(asin),
      priceUsd,
      storeTitle: title,
      imageUrl,
      externalId: asin,
      fromSearchParser: true,
    });
  }

  return hits;
}

function pickBestAmazonHit(
  hits: RetailerSearchHit[],
  item?: CatalogItem,
  intent?: ShoppingIntent,
): RetailerSearchHit | null {
  if (!hits.length) return null;
  if (item) {
    const { hit } = pickBestAmazonHitByCatalog(hits, item, intent);
    if (hit) return hit;
    return null;
  }
  const withPrice = hits.filter((h) => h.priceUsd && h.pdpUrl);
  if (withPrice[0]) return withPrice[0];
  const withPdp = hits.filter((h) => h.pdpUrl);
  return withPdp[0] ?? null;
}

export const amazonAdapter: RetailerPageAdapter = {
  retailerId: "amazon",

  extractSearchResults(html: string): RetailerSearchHit | null {
    if (/captcha|robot check|api-services-support@amazon\.com/i.test(html)) {
      return null;
    }
    return pickBestAmazonHit(extractAmazonSearchHits(html));
  },

  extractPdpPage(html: string, pageUrl: string): RetailerSearchHit | null {
    const asin =
      pageUrl.match(/\/dp\/([A-Z0-9]{10})/i)?.[1] ??
      html.match(/"asin"\s*:\s*"([A-Z0-9]{10})"/i)?.[1];
    const priceUsd =
      parsePriceFromText(html) ??
      parsePriceUsd(html.match(/"priceAmount"\s*:\s*([\d.]+)/)?.[1]);
    const storeTitle =
      html.match(/id=["']productTitle["'][^>]*>([\s\S]*?)<\//i)?.[1]?.replace(/<[^>]+>/g, "").trim() ??
      html.match(/"title"\s*:\s*"([^"\\]+)"/)?.[1];
    const imageUrl =
      html.match(/id=["']landingImage["'][^>]+src=["']([^"']+)["']/i)?.[1] ??
      html.match(/"hiRes"\s*:\s*"([^"\\]+)"/)?.[1];

    if (!asin && !priceUsd) return null;

    return {
      pdpUrl: asin ? amazonPdpUrl(asin) : pageUrl,
      priceUsd,
      storeTitle,
      imageUrl,
      externalId: asin,
      fromSearchParser: false,
    };
  },
};
