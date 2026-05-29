import type { RetailerPageAdapter, RetailerSearchHit } from "./types";
import { extractNextData, collectObjects, firstString } from "./html-json";
import { parsePriceUsd } from "./price-parse";

function walmartPriceFromItem(item: Record<string, unknown>): number | undefined {
  const priceInfo = item.priceInfo;
  if (priceInfo && typeof priceInfo === "object") {
    const pi = priceInfo as Record<string, unknown>;
    const current = pi.currentPrice;
    if (current && typeof current === "object") {
      const p = parsePriceUsd((current as Record<string, unknown>).price);
      if (p) return p;
    }
    const line = parsePriceUsd(pi.linePrice);
    if (line) return line;
  }

  const primary = item.primaryOffer;
  if (primary && typeof primary === "object") {
    const p = parsePriceUsd((primary as Record<string, unknown>).offerPrice);
    if (p) return p;
  }

  const offer = item.offer;
  if (offer && typeof offer === "object") {
    const p = parsePriceUsd((offer as Record<string, unknown>).price);
    if (p) return p;
  }

  return undefined;
}

function walmartPdpUrl(item: Record<string, unknown>): string | undefined {
  const canonical = firstString(item, ["canonicalUrl", "productPageUrl"]);
  if (canonical?.includes("/ip/")) {
    try {
      return new URL(canonical, "https://www.walmart.com").href;
    } catch {
      /* fall through */
    }
  }
  const id = item.usItemId ?? item.id ?? item.productId;
  if (typeof id === "string" || typeof id === "number") {
    const slug = firstString(item, ["name", "title"])?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    if (slug) {
      return `https://www.walmart.com/ip/${slug}/${id}`;
    }
    return `https://www.walmart.com/ip/${id}`;
  }
  return undefined;
}

function walmartImage(item: Record<string, unknown>): string | undefined {
  const imageInfo = item.imageInfo;
  if (imageInfo && typeof imageInfo === "object") {
    const ii = imageInfo as Record<string, unknown>;
    const thumb = firstString(ii, ["thumbnailUrl", "imageUrl"]);
    if (thumb?.startsWith("http")) return thumb;
  }
  const image = item.image;
  if (typeof image === "string" && image.startsWith("http")) return image;
  return undefined;
}

function itemFromWalmartNextData(next: unknown): Record<string, unknown> | undefined {
  const stacks = collectObjects(
    next,
    (o) => Array.isArray(o.itemStacks) || Array.isArray(o.items),
    20,
  );
  for (const stack of stacks) {
    const itemStacks = stack.itemStacks;
    if (Array.isArray(itemStacks)) {
      for (const s of itemStacks) {
        if (!s || typeof s !== "object") continue;
        const items = (s as Record<string, unknown>).items;
        if (Array.isArray(items) && items[0] && typeof items[0] === "object") {
          return items[0] as Record<string, unknown>;
        }
      }
    }
    const items = stack.items;
    if (Array.isArray(items) && items[0] && typeof items[0] === "object") {
      return items[0] as Record<string, unknown>;
    }
  }

  return collectObjects(
    next,
    (o) => typeof o.usItemId === "string" || typeof o.usItemId === "number",
    1,
  )[0];
}

function itemFromWalmartRegex(html: string): Record<string, unknown> | undefined {
  const idMatch = html.match(/"usItemId"\s*:\s*"(\d+)"/);
  if (!idMatch?.[1]) return undefined;
  const titleMatch = html.match(/"name"\s*:\s*"([^"\\]+)"/);
  const priceMatch =
    html.match(/"currentPrice"\s*:\s*\{\s*"price"\s*:\s*([\d.]+)/) ??
    html.match(/"offerPrice"\s*:\s*([\d.]+)/);
  const imageMatch = html.match(/"thumbnailUrl"\s*:\s*"([^"\\]+)"/);
  return {
    usItemId: idMatch[1],
    name: titleMatch?.[1],
    priceInfo: priceMatch?.[1] ?
      { currentPrice: { price: parseFloat(priceMatch[1]) } }
    : undefined,
    imageInfo: imageMatch?.[1] ? { thumbnailUrl: imageMatch[1] } : undefined,
  };
}

function hitFromItem(item: Record<string, unknown>): RetailerSearchHit | null {
  const pdpUrl = walmartPdpUrl(item);
  const priceUsd = walmartPriceFromItem(item);
  const storeTitle = firstString(item, ["name", "title", "productName"]);
  const imageUrl = walmartImage(item);
  const externalId =
    typeof item.usItemId === "string" || typeof item.usItemId === "number"
      ? String(item.usItemId)
      : undefined;

  if (!pdpUrl && !priceUsd && !storeTitle) return null;

  return {
    pdpUrl,
    priceUsd,
    storeTitle,
    imageUrl,
    externalId,
    fromSearchParser: true,
  };
}

export const walmartAdapter: RetailerPageAdapter = {
  retailerId: "walmart",

  extractSearchResults(html: string): RetailerSearchHit | null {
    const next = extractNextData(html);
    const item = next ? itemFromWalmartNextData(next) : undefined;
    if (item) {
      const hit = hitFromItem(item);
      if (hit) return hit;
    }
    const fallback = itemFromWalmartRegex(html);
    return fallback ? hitFromItem(fallback) : null;
  },
};
