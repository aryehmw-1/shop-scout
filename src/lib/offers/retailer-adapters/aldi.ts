import type { RetailerPageAdapter, RetailerSearchHit } from "./types";
import { extractNextData, collectObjects, firstString } from "./html-json";
import { parsePriceUsd } from "./price-parse";

function aldiPrice(row: Record<string, unknown>): number | undefined {
  const price = row.price;
  if (price && typeof price === "object") {
    const p = price as Record<string, unknown>;
    return (
      parsePriceUsd(p.amount) ??
      parsePriceUsd(p.display) ??
      parsePriceUsd(p.value)
    );
  }
  return parsePriceUsd(row.retailPrice ?? row.salePrice);
}

function isValidAldiProductUrl(url: string): boolean {
  if (!url.includes("aldi.us")) return false;
  if (/\/pages\/|explore-all|\/store\/aldi\/pages\//i.test(url)) return false;
  return /\/product\//i.test(url) || /\/products\/k\//i.test(url);
}

function aldiPdpUrl(row: Record<string, unknown>): string | undefined {
  const direct = firstString(row, ["url", "productUrl", "canonicalUrl", "link"]);
  if (direct?.includes("aldi.us")) {
    try {
      const href = new URL(direct, "https://www.aldi.us").href;
      if (isValidAldiProductUrl(href)) return href;
    } catch {
      /* fall through */
    }
  }
  const slug = firstString(row, ["slug", "productSlug"]);
  const sku = row.sku ?? row.id ?? row.productId;
  if (slug && typeof slug === "string") {
    return `https://www.aldi.us/product/${slug}`;
  }
  if (typeof sku === "string" || typeof sku === "number") {
    return `https://www.aldi.us/products/k/${sku}`;
  }
  return undefined;
}

function productFromAldi(html: string): Record<string, unknown> | undefined {
  const next = extractNextData(html);
  if (next) {
    const products = collectObjects(
      next,
      (o) =>
        typeof o.sku === "string" ||
        typeof o.slug === "string" ||
        (typeof o.url === "string" && isValidAldiProductUrl(o.url)) ||
        (typeof o.url === "string" && /\/product\//i.test(o.url)),
      15,
    );
    for (const p of products) {
      const hit = hitFromRow(p);
      if (hit) return p;
    }
  }

  const sku = html.match(/"sku"\s*:\s*"([^"\\]+)"/)?.[1];
  const slug = html.match(/"slug"\s*:\s*"([^"\\]+)"/)?.[1];
  const price =
    html.match(/"amount"\s*:\s*([\d.]+)/)?.[1] ??
    html.match(/"retailPrice"\s*:\s*([\d.]+)/)?.[1];
  if (!sku && !slug) return undefined;
  return {
    sku,
    slug,
    name: html.match(/"name"\s*:\s*"([^"\\]+)"/)?.[1],
    price: price ? { amount: parseFloat(price) } : undefined,
  };
}

function hitFromRow(row: Record<string, unknown>): RetailerSearchHit | null {
  const pdpUrl = aldiPdpUrl(row);
  const priceUsd = aldiPrice(row);
  const storeTitle = firstString(row, ["name", "title", "productName"]);
  const imageUrl = firstString(row, ["imageUrl", "image", "thumbnailUrl"]);
  if (pdpUrl && !isValidAldiProductUrl(pdpUrl)) return null;
  if (!pdpUrl && !priceUsd) return null;
  return {
    pdpUrl,
    priceUsd,
    storeTitle,
    imageUrl: imageUrl?.startsWith("http") ? imageUrl : undefined,
    externalId: typeof row.sku === "string" ? row.sku : undefined,
    fromSearchParser: true,
  };
}

export const aldiAdapter: RetailerPageAdapter = {
  retailerId: "aldi",

  extractSearchResults(html: string): RetailerSearchHit | null {
    const row = productFromAldi(html);
    return row ? hitFromRow(row) : null;
  },
};
