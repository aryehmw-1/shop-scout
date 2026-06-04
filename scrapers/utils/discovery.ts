import * as cheerio from "cheerio";
import { fetchHtml } from "./http";

const PRODUCT_PATH_RE =
  /\/(product|products|p|dp|ip|item|shop|buy|sku|pd|prod)[\/-]/i;

export function isLikelyProductUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/^https?:$/i.test(u.protocol)) return false;
    const path = u.pathname.toLowerCase();
    if (path.length < 4) return false;
    if (PRODUCT_PATH_RE.test(path)) return true;
    if (/\/\d{5,}/.test(path) && !/category|search|browse/i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

export async function discoverFromSitemap(
  sitemapUrl: string,
  opts: { timeoutMs: number; userAgent: string; rateLimitRps: number; limit: number },
): Promise<string[]> {
  const xml = await fetchHtml(sitemapUrl, opts);
  if (!xml) return [];

  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.trim());
  const nested = locs.filter((u) => /sitemap.*\.xml/i.test(u));
  const products: string[] = [];

  for (const loc of locs) {
    if (isLikelyProductUrl(loc)) products.push(loc);
    if (products.length >= opts.limit) break;
  }

  if (products.length < opts.limit && nested.length) {
    for (const child of nested.slice(0, 3)) {
      const more = await discoverFromSitemap(child, {
        ...opts,
        limit: opts.limit - products.length,
      });
      products.push(...more);
      if (products.length >= opts.limit) break;
    }
  }

  return dedupeUrls(products).slice(0, opts.limit);
}

export async function discoverFromCategoryPage(
  categoryUrl: string,
  opts: { timeoutMs: number; userAgent: string; rateLimitRps: number; limit: number },
): Promise<string[]> {
  const html = await fetchHtml(categoryUrl, opts);
  if (!html) return [];
  const $ = cheerio.load(html);
  const found: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, categoryUrl).href;
      if (isLikelyProductUrl(abs)) found.push(abs);
    } catch {
      /* skip */
    }
  });
  return dedupeUrls(found).slice(0, opts.limit);
}

export function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const key = u.split("#")[0]!.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}
