import { parseAmazonAsin } from "../search/providers/amazon-asin";
import type { RetailerId } from "../types";

export interface ExtensionPageContext {
  url: string;
  title: string;
  retailer?: RetailerId;
  asin?: string;
  price?: number;
}

const HOST_RETAILER: Array<[RegExp, RetailerId]> = [
  [/amazon\.(com|ca|co\.uk)/i, "amazon"],
  [/walmart\.com/i, "walmart"],
  [/target\.com/i, "target"],
  [/nike\.com/i, "nike"],
  [/costco\.com/i, "costco"],
  [/kohls\.com/i, "kohls"],
  [/macys\.com/i, "macys"],
];

export function detectRetailerFromUrl(url: string): RetailerId | undefined {
  try {
    const host = new URL(url).hostname;
    for (const [re, id] of HOST_RETAILER) {
      if (re.test(host)) return id;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function buildQueryFromPageContext(ctx: ExtensionPageContext): string {
  let q = ctx.title.trim();
  q = q
    .replace(/\s*[|\-–—]\s*Amazon\.com.*$/i, "")
    .replace(/\s*[|\-–—]\s*Walmart\.com.*$/i, "")
    .replace(/\s*[|\-–—]\s*Target.*$/i, "")
    .trim();
  if (q.length < 3) {
    try {
      const path = new URL(ctx.url).pathname;
      const slug = path.split("/").filter(Boolean).pop()?.replace(/-/g, " ");
      if (slug && slug.length > 3) q = slug;
    } catch {
      /* ignore */
    }
  }
  return q.slice(0, 200);
}

export function normalizeExtensionContext(
  raw: Partial<ExtensionPageContext> & { url: string },
): ExtensionPageContext {
  const url = raw.url.trim();
  const title = (raw.title ?? "").trim() || "Product";
  const retailer = raw.retailer ?? detectRetailerFromUrl(url);
  const asin = raw.asin ?? (retailer === "amazon" ? parseAmazonAsin(url) : undefined);

  let price = raw.price;
  if (typeof price === "string") {
    const n = parseFloat(price);
    price = Number.isFinite(n) ? n : undefined;
  }

  return { url, title, retailer, asin, price };
}
