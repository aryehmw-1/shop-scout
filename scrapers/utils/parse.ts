import * as cheerio from "cheerio";
import type { DemoProduct } from "../base/types";
import { extractBestImageUrl } from "./extract-images";

export interface ParsedProductFields {
  title: string | null;
  brand: string | null;
  category: string | null;
  price: number | null;
  currency: string;
  image_url: string | null;
  description: string | null;
  availability: DemoProduct["availability"];
}

export function parseProductHtml(
  html: string,
  pageUrl: string,
): ParsedProductFields | null {
  const $ = cheerio.load(html);
  const jsonLd = extractJsonLdProduct($);

  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
  const title =
    jsonLd?.name ??
    ogTitle ??
    ($("h1").first().text().trim() || null);
  if (!title || title.length < 3) return null;

  const image_urlEarly = jsonLd?.image ?? extractBestImageUrl($, pageUrl);
  if (!image_urlEarly) return null;

  const price =
    jsonLd?.price ??
    parsePrice($('meta[property="product:price:amount"]').attr("content")) ??
    parsePrice($('[itemprop="price"]').attr("content")) ??
    parsePrice($(".price, .product-price, [data-test='product-price']").first().text());

  const image_url = image_urlEarly;

  const description =
    jsonLd?.description ??
    $('meta[property="og:description"]').attr("content")?.trim() ??
    null;

  const brand = jsonLd?.brand ?? $('meta[property="product:brand"]').attr("content")?.trim() ?? null;
  const category =
    jsonLd?.category ??
    $('meta[property="product:category"]').attr("content")?.trim() ??
    null;

  const availability = jsonLd?.availability ?? guessAvailability($);

  return {
    title: title.slice(0, 300),
    brand: brand ? brand.slice(0, 120) : null,
    category: category ? category.slice(0, 120) : null,
    price,
    currency: jsonLd?.currency ?? "USD",
    image_url: image_url ? absolutize(pageUrl, image_url) : null,
    description: description ? description.slice(0, 2000) : null,
    availability,
  };
}

function extractJsonLdProduct($: cheerio.CheerioAPI): {
  name?: string;
  brand?: string;
  category?: string;
  description?: string;
  price?: number;
  currency?: string;
  image?: string;
  availability?: DemoProduct["availability"];
} | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const raw = $(scripts[i]).html();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as unknown;
      const node = findProductNode(data);
      if (!node) continue;
      const offers = (node as Record<string, unknown>).offers;
      const offer = Array.isArray(offers) ? offers[0] : offers;
      const offerObj =
        offer && typeof offer === "object" ? (offer as Record<string, unknown>) : {};
      const price = parsePrice(String(offerObj.price ?? node.price ?? ""));
      const currency = String(offerObj.priceCurrency ?? node.priceCurrency ?? "USD");
      const brandRaw = node.brand;
      const brand =
        typeof brandRaw === "string"
          ? brandRaw
          : brandRaw && typeof brandRaw === "object"
            ? String((brandRaw as { name?: string }).name ?? "")
            : undefined;
      const image = node.image;
      const imageUrl = Array.isArray(image) ? String(image[0]) : image ? String(image) : undefined;
      return {
        name: String(node.name ?? ""),
        brand,
        category: node.category ? String(node.category) : undefined,
        description: node.description ? String(node.description) : undefined,
        price: price ?? undefined,
        currency,
        image: imageUrl,
        availability: mapAvailability(String(offerObj.availability ?? node.availability ?? "")),
      };
    } catch {
      /* next script */
    }
  }
  return null;
}

function findProductNode(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findProductNode(item);
      if (found) return found;
    }
    return null;
  }
  const obj = data as Record<string, unknown>;
  const type = String(obj["@type"] ?? "");
  if (/product/i.test(type)) return obj;
  if (obj["@graph"] && Array.isArray(obj["@graph"])) {
    return findProductNode(obj["@graph"]);
  }
  return null;
}

function mapAvailability(raw: string): DemoProduct["availability"] {
  const s = raw.toLowerCase();
  if (s.includes("instock") || s.includes("in_stock")) return "in_stock";
  if (s.includes("outofstock") || s.includes("out_of_stock")) return "out_of_stock";
  return "unknown";
}

function guessAvailability($: cheerio.CheerioAPI): DemoProduct["availability"] {
  const text = $("body").text().toLowerCase().slice(0, 5000);
  if (/out of stock|sold out|unavailable/i.test(text)) return "out_of_stock";
  if (/add to cart|in stock|buy now/i.test(text)) return "in_stock";
  return "unknown";
}

export function parsePrice(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const m = String(raw).replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null;
}

function absolutize(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}
