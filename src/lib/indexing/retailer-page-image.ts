import { retailerIdFromProductUrl } from "../matching/url-parser";
import { isWeakProductImage } from "../search/product-image-quality";
import type { RetailerId } from "../types";

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; ShopScout/1.0; +https://shop-scout-one.vercel.app)";

function absolutize(url: string, base: string): string | undefined {
  try {
    return new URL(url, base).href;
  } catch {
    return undefined;
  }
}

function cleanImageUrl(url: string): string | undefined {
  const u = url.trim();
  if (!u.startsWith("https://")) return undefined;
  const lower = u.toLowerCase();
  if (lower.includes("logo") || lower.includes("icon") || lower.includes("sprite")) {
    return undefined;
  }
  if (lower.endsWith(".svg")) return undefined;
  return u;
}

function metaContent(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  if (m?.[1]) return m[1];
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2?.[1];
}

function imagesFromJsonLd(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    try {
      const json = JSON.parse(block[1]!) as unknown;
      const nodes = Array.isArray(json) ? json : [json];
      for (const node of nodes) {
        collectJsonLdImages(node, baseUrl, out);
      }
    } catch {
      /* skip invalid JSON-LD */
    }
  }
  return out;
}

function collectJsonLdImages(node: unknown, baseUrl: string, out: string[]): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const type = String(obj["@type"] ?? "").toLowerCase();
  if (type.includes("product") || obj.image) {
    const img = obj.image;
    if (typeof img === "string") {
      const abs = absolutize(img, baseUrl);
      if (abs) out.push(abs);
    } else if (Array.isArray(img)) {
      for (const entry of img) {
        if (typeof entry === "string") {
          const abs = absolutize(entry, baseUrl);
          if (abs) out.push(abs);
        } else if (entry && typeof entry === "object") {
          const url = (entry as { url?: string }).url;
          if (url) {
            const abs = absolutize(url, baseUrl);
            if (abs) out.push(abs);
          }
        }
      }
    } else if (img && typeof img === "object") {
      const url = (img as { url?: string }).url;
      if (url) {
        const abs = absolutize(url, baseUrl);
        if (abs) out.push(abs);
      }
    }
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) v.forEach((child) => collectJsonLdImages(child, baseUrl, out));
    else if (v && typeof v === "object") collectJsonLdImages(v, baseUrl, out);
  }
}

export function extractProductImageFromHtml(html: string, pageUrl: string): string | undefined {
  const candidates: string[] = [];

  for (const key of ["og:image", "og:image:secure_url", "twitter:image"]) {
    const val = metaContent(html, key);
    if (val) {
      const abs = absolutize(val, pageUrl);
      if (abs) candidates.push(abs);
    }
  }

  candidates.push(...imagesFromJsonLd(html, pageUrl));

  for (const c of candidates) {
    const cleaned = cleanImageUrl(c);
    if (cleaned && !isWeakProductImage(cleaned)) return cleaned;
  }

  for (const c of candidates) {
    const cleaned = cleanImageUrl(c);
    if (cleaned) return cleaned;
  }

  return undefined;
}

export function isRetailerHostedImage(
  imageUrl: string,
  retailerId: RetailerId,
): boolean {
  try {
    return retailerIdFromProductUrl(imageUrl) === retailerId;
  } catch {
    return false;
  }
}

export function isGenericCatalogImage(url: string | undefined): boolean {
  if (!url?.startsWith("https://")) return true;
  return /unsplash\.com|placehold\.co|via\.placeholder/i.test(url);
}

const BANNER_HINT =
  /banner|sprite|logo|favicon|pixel|tracking|spacer|1x1|badge|icon-/;
const PRODUCT_HINT = /product|sku|item|gallery|zoom|hero|pdp|catalog/;

/** 0–1 confidence that URL is a product photo (not banner/thumb). */
export function scoreProductImageUrl(url: string): number {
  if (!url.startsWith("https://")) return 0;
  const lower = url.toLowerCase();
  let score = 0.55;
  if (PRODUCT_HINT.test(lower)) score += 0.2;
  if (BANNER_HINT.test(lower)) score -= 0.45;
  if (/thumb|thumbnail|_xs|_sm\b|w=\d{1,2}\b/.test(lower)) score -= 0.25;
  if (/\.(jpg|jpeg|webp|png)(\?|$)/.test(lower)) score += 0.1;
  if (isGenericCatalogImage(url)) score -= 0.2;
  return Math.max(0, Math.min(1, score));
}

export async function fetchImageFromRetailerPage(
  pageUrl: string,
  retailerId: RetailerId,
): Promise<string | undefined> {
  if (!pageUrl.startsWith("https://")) return undefined;
  if (retailerIdFromProductUrl(pageUrl) !== retailerId) return undefined;

  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    if (html.length < 200) return undefined;
    return extractProductImageFromHtml(html, res.url || pageUrl);
  } catch {
    return undefined;
  }
}
