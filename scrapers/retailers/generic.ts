import type { DemoProduct, RetailerScraper, ScrapeContext, ScrapeResult } from "../base/types";
import { discoverFromCategoryPage, discoverFromSitemap, dedupeUrls } from "../utils/discovery";
import { fetchHtml } from "../utils/http";
import { isAllowedByRobots } from "../utils/robots";
import { parseProductHtml } from "../utils/parse";
import { makeProductId } from "../utils/storage";
import { mapWithConcurrency } from "../utils/queue";
import { RETAILER_SEEDS } from "../config";

export function createGenericScraper(retailer: string, domain: string): RetailerScraper {
  return {
    retailer,
    domains: [domain],
    discoverProductUrls: (ctx, limit) => discoverUrls(retailer, domain, ctx, limit),
    scrapeProductUrls: (ctx, urls) => scrapeUrls(retailer, domain, ctx, urls),
  };
}

async function discoverUrls(
  retailer: string,
  domain: string,
  ctx: ScrapeContext,
  limit: number,
): Promise<string[]> {
  const seeds = RETAILER_SEEDS[retailer];
  const fetchOpts = {
    timeoutMs: ctx.timeoutMs,
    userAgent: ctx.userAgent,
    rateLimitRps: ctx.rateLimitRps,
    limit,
  };

  const found: string[] = [];

  if (seeds?.sitemap) {
    const fromSite = await discoverFromSitemap(seeds.sitemap, fetchOpts);
    found.push(...fromSite);
  }

  for (const cat of seeds?.categories ?? []) {
    if (found.length >= limit) break;
    const fromCat = await discoverFromCategoryPage(cat, {
      ...fetchOpts,
      limit: limit - found.length,
    });
    found.push(...fromCat);
  }

  return dedupeUrls(found).filter((u) => !u.endsWith("/") || u.split("/").length > 4).slice(0, limit);
}

async function scrapeUrls(
  retailer: string,
  domain: string,
  ctx: ScrapeContext,
  urls: string[],
): Promise<ScrapeResult> {
  const products: DemoProduct[] = [];
  const errors: string[] = [];
  let urlsSucceeded = 0;

  await mapWithConcurrency(
    urls,
    Math.max(1, Math.min(3, ctx.rateLimitRps)),
    async (url) => {
      const allowed = await isAllowedByRobots(url, {
        userAgent: ctx.userAgent,
        timeoutMs: ctx.timeoutMs,
      });
      if (!allowed) {
        errors.push(`robots_disallow:${url}`);
        return;
      }

      let html = await fetchHtml(url, {
        timeoutMs: ctx.timeoutMs,
        userAgent: ctx.userAgent,
        rateLimitRps: ctx.rateLimitRps,
      });

      if (!html) {
        html = await tryPlaywrightFetch(url, ctx);
      }

      if (!html) {
        errors.push(`fetch_failed:${url}`);
        return;
      }

      const parsed = parseProductHtml(html, url);
      if (!parsed?.title || !parsed.image_url) {
        errors.push(`parse_failed:${url}`);
        return;
      }

      urlsSucceeded++;
      products.push({
        id: makeProductId(retailer, url),
        retailer,
        retailer_domain: domain,
        title: parsed.title,
        brand: parsed.brand,
        category: parsed.category,
        price: parsed.price,
        currency: parsed.currency,
        image_url: parsed.image_url,
        product_url: url,
        availability: parsed.availability,
        description: parsed.description,
        scraped_at: new Date().toISOString(),
      });
    },
    { retries: ctx.maxRetries, retryDelayMs: 800 },
  );

  return {
    products,
    errors,
    urlsAttempted: urls.length,
    urlsSucceeded,
  };
}

async function tryPlaywrightFetch(url: string, ctx: ScrapeContext): Promise<string | null> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ userAgent: ctx.userAgent });
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: ctx.timeoutMs,
      });
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}
