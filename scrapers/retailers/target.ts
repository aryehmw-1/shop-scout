import type { RetailerScraper, ScrapeContext, ScrapeResult } from "../base/types";
import { createGenericScraper } from "./generic";
import { parseProductHtml } from "../utils/parse";
import { fetchHtml } from "../utils/http";
import { makeProductId } from "../utils/storage";

const base = createGenericScraper("target", "target.com");

/**
 * Target override: prefer TCIN-style /p/ URLs and stricter title extraction.
 */
export const targetScraper: RetailerScraper = {
  ...base,
  retailer: "target",
  domains: ["target.com"],
  async scrapeProductUrls(ctx: ScrapeContext, urls: string[]): Promise<ScrapeResult> {
    const pdpUrls = urls.filter((u) => /target\.com\/p\//i.test(u));
    const toScrape = pdpUrls.length ? pdpUrls : urls;
    const result = await base.scrapeProductUrls(ctx, toScrape);

    const enriched = result.products.map((p) => {
      if (p.brand || !p.title.includes(" - ")) return p;
      const [brand, ...rest] = p.title.split(" - ");
      if (rest.length) {
        return { ...p, brand: brand.trim(), title: rest.join(" - ").trim() };
      }
      return p;
    });

    return { ...result, products: enriched };
  },
  async discoverProductUrls(ctx: ScrapeContext, limit: number) {
    const urls = await base.discoverProductUrls(ctx, limit * 2);
    const pdp = urls.filter((u) => /target\.com\/p\//i.test(u));
    return pdp.slice(0, limit).length ? pdp.slice(0, limit) : urls.slice(0, limit);
  },
};

/** Quick single-URL scrape helper for audits. */
export async function scrapeTargetUrl(url: string, ctx: ScrapeContext) {
  const html = await fetchHtml(url, {
    timeoutMs: ctx.timeoutMs,
    userAgent: ctx.userAgent,
    rateLimitRps: ctx.rateLimitRps,
  });
  if (!html) return null;
  const parsed = parseProductHtml(html, url);
  if (!parsed) return null;
  return {
    id: makeProductId("target", url),
    retailer: "target",
    retailer_domain: "target.com",
    ...parsed,
    product_url: url,
    scraped_at: new Date().toISOString(),
  };
}
