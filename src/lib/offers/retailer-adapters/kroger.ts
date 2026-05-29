import type { RetailerPageAdapter, RetailerSearchHit } from "./types";
import { extractNextData, collectObjects, firstString } from "./html-json";
import { parsePriceUsd } from "./price-parse";

function krogerPrice(row: Record<string, unknown>): number | undefined {
  const price = row.price;
  if (price && typeof price === "object") {
    const p = price as Record<string, unknown>;
    return (
      parsePriceUsd(p.regular) ??
      parsePriceUsd(p.promo) ??
      parsePriceUsd(p.nationalPrice) ??
      parsePriceUsd(p.storePrice)
    );
  }
  const fulfillment = row.fulfillment;
  if (fulfillment && typeof fulfillment === "object") {
    const f = fulfillment as Record<string, unknown>;
    const instore = f.instore;
    if (instore && typeof instore === "object") {
      const p = parsePriceUsd((instore as Record<string, unknown>).regular);
      if (p) return p;
    }
  }
  return parsePriceUsd(row.regularPrice ?? row.promoPrice);
}

function krogerPdpUrl(row: Record<string, unknown>): string | undefined {
  const direct = firstString(row, ["productPageURL", "productUrl", "seoCanonicalUrl", "url"]);
  if (direct?.includes("kroger.com")) {
    try {
      return new URL(direct).href;
    } catch {
      /* fall through */
    }
  }
  const slug = firstString(row, ["seoDescription", "description", "slug"]);
  const upc = row.upc ?? row.productId ?? row.id;
  if (slug && upc) {
    return `https://www.kroger.com/p/${slug}/${upc}`;
  }
  const path = htmlPathFromRow(row);
  if (path) return `https://www.kroger.com${path.startsWith("/") ? path : `/${path}`}`;
  return undefined;
}

function htmlPathFromRow(row: Record<string, unknown>): string | undefined {
  const share = row.shareLink;
  if (typeof share === "string" && share.includes("/p/")) {
    const m = share.match(/(\/p\/[^?"']+)/);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function krogerImage(row: Record<string, unknown>): string | undefined {
  const images = row.images;
  if (Array.isArray(images) && images[0] && typeof images[0] === "object") {
    const u = firstString(images[0] as Record<string, unknown>, [
      "url",
      "xlarge",
      "large",
      "medium",
    ]);
    if (u?.startsWith("http")) return u;
  }
  const img = firstString(row, ["imageUrl", "image"]);
  return img?.startsWith("http") ? img : undefined;
}

function productFromKroger(html: string): Record<string, unknown> | undefined {
  const next = extractNextData(html);
  if (next) {
    const products = collectObjects(
      next,
      (o) =>
        typeof o.upc === "string" ||
        typeof o.upc === "number" ||
        (typeof o.productId === "string" && String(o.productId).length >= 8),
      20,
    );
    for (const p of products) {
      if (krogerPrice(p) || krogerPdpUrl(p)) return p;
    }
    if (products[0]) return products[0];
  }

  const upc = html.match(/"upc"\s*:\s*"(\d{8,14})"/)?.[1];
  if (!upc) return undefined;
  const price =
    html.match(/"regular"\s*:\s*([\d.]+)/)?.[1] ??
    html.match(/"nationalPrice"\s*:\s*([\d.]+)/)?.[1];
  const title = html.match(/"description"\s*:\s*"([^"\\]+)"/)?.[1];
  return {
    upc,
    description: title,
    price: price ? { regular: parseFloat(price) } : undefined,
  };
}

function hitFromRow(row: Record<string, unknown>): RetailerSearchHit | null {
  const pdpUrl = krogerPdpUrl(row);
  const priceUsd = krogerPrice(row);
  const storeTitle = firstString(row, ["description", "name", "title"]);
  const imageUrl = krogerImage(row);
  if (!pdpUrl && !priceUsd) return null;
  return {
    pdpUrl,
    priceUsd,
    storeTitle,
    imageUrl,
    externalId: row.upc != null ? String(row.upc) : undefined,
    fromSearchParser: true,
  };
}

export const krogerAdapter: RetailerPageAdapter = {
  retailerId: "kroger",

  extractSearchResults(html: string): RetailerSearchHit | null {
    const row = productFromKroger(html);
    return row ? hitFromRow(row) : null;
  },
};
