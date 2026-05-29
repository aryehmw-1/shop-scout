import type { RetailerPageAdapter, RetailerSearchHit } from "./types";
import { collectObjects, firstString } from "./html-json";
import { parsePriceFromText, parsePriceUsd } from "./price-parse";

function costcoPrice(row: Record<string, unknown>): number | undefined {
  const price = row.price;
  if (typeof price === "number") return parsePriceUsd(price);
  if (price && typeof price === "object") {
    const p = price as Record<string, unknown>;
    return parsePriceUsd(p.value ?? p.amount ?? p.formatted);
  }
  return parsePriceUsd(row.unitSellPrice ?? row.sellPrice ?? row.minSalePrice);
}

function costcoPdpUrl(row: Record<string, unknown>, html: string): string | undefined {
  const direct = firstString(row, [
    "productUrl",
    "pdpUrl",
    "canonicalUrl",
    "seoUrl",
    "url",
  ]);
  if (direct?.includes("costco.com")) {
    try {
      return new URL(direct, "https://www.costco.com").href;
    } catch {
      /* fall through */
    }
  }
  const id = row.itemNumber ?? row.productId ?? row.id;
  if (typeof id === "string" || typeof id === "number") {
    const m = html.match(
      new RegExp(`href=["']([^"']*\\.product\\.${id}\\.html[^"']*)["']`, "i"),
    );
    if (m?.[1]) {
      try {
        return new URL(m[1], "https://www.costco.com").href;
      } catch {
        /* fall through */
      }
    }
  }
  const productLink = html.match(
    /href=["'](https:\/\/www\.costco\.com\/[^"']+\.product\.\d+\.html)["']/i,
  )?.[1];
  return productLink;
}

function productFromCostco(html: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    if (html.trimStart().startsWith("{")) {
      parsed = JSON.parse(html) as unknown;
    }
  } catch {
    parsed = undefined;
  }
  if (parsed) {
    const products = collectObjects(
      parsed,
      (o) =>
        typeof o.itemNumber === "string" ||
        typeof o.itemNumber === "number" ||
        (typeof o.productId === "string" && /^\d{5,}$/.test(o.productId)),
      25,
    );
    for (const p of products) {
      if (costcoPrice(p) || costcoPdpUrl(p, html)) return p;
    }
  }

  const itemNumber = html.match(/"itemNumber"\s*:\s*"?(\d{5,})"?/)?.[1];
  if (!itemNumber) {
    const link = html.match(
      /href=["'](https:\/\/www\.costco\.com\/[^"']+\.product\.\d+\.html)["']/i,
    )?.[1];
    if (!link) return undefined;
    const price = parsePriceFromText(html);
    return { itemNumber: link.match(/\.product\.(\d+)\.html/i)?.[1], productUrl: link, price };
  }

  const price =
    html.match(/"unitSellPrice"\s*:\s*([\d.]+)/)?.[1] ??
    html.match(/"sellPrice"\s*:\s*([\d.]+)/)?.[1];
  const title = html.match(/"itemName"\s*:\s*"([^"\\]+)"/)?.[1];
  const productUrl = html.match(
    /href=["'](https:\/\/www\.costco\.com\/[^"']+\.product\.\d+\.html)["']/i,
  )?.[1];
  return {
    itemNumber,
    itemName: title,
    unitSellPrice: price ? parseFloat(price) : undefined,
    productUrl,
  };
}

function hitFromRow(row: Record<string, unknown>, html: string): RetailerSearchHit | null {
  const pdpUrl = costcoPdpUrl(row, html);
  const priceUsd = costcoPrice(row) ?? parsePriceFromText(html);
  const storeTitle = firstString(row, ["itemName", "name", "title", "description"]);
  const imageUrl = firstString(row, ["imageUrl", "image", "imgUrl"]);
  if (!pdpUrl && !priceUsd) return null;
  return {
    pdpUrl,
    priceUsd,
    storeTitle,
    imageUrl: imageUrl?.startsWith("http") ? imageUrl : undefined,
    externalId:
      row.itemNumber != null ? String(row.itemNumber) : undefined,
    fromSearchParser: true,
  };
}

export const costcoAdapter: RetailerPageAdapter = {
  retailerId: "costco",

  extractSearchResults(html: string): RetailerSearchHit | null {
    const row = productFromCostco(html);
    return row ? hitFromRow(row, html) : null;
  },
};
