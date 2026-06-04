import { amazonPaapiSearchItems } from "../../src/lib/search/providers/amazon-paapi";
import { isAmazonPaapiConfigured } from "../../src/lib/search/providers/amazon-paapi-config";
import type { DemoProduct } from "../base/types";
import { BULK_SEARCH_QUERIES } from "../config";
import { CATALOG } from "../../src/lib/retailers/catalog";
import { makeProductId } from "../utils/storage";
import { mapWithConcurrency, sleep } from "../utils/queue";

export async function ingestFromAmazonPaapi(opts?: {
  maxQueries?: number;
  itemsPerQuery?: number;
}): Promise<DemoProduct[]> {
  if (!isAmazonPaapiConfigured()) {
    console.log("[amazon-paapi] not configured — skip (set AMAZON_PA_API_* env)");
    return [];
  }

  const queries = new Set<string>();
  for (const item of CATALOG) queries.add(item.title);
  for (const q of BULK_SEARCH_QUERIES) queries.add(q);
  const queryList = [...queries].slice(0, opts?.maxQueries ?? 150);
  const itemsPerQuery = opts?.itemsPerQuery ?? 10;

  const products: DemoProduct[] = [];
  const seen = new Set<string>();

  console.log(`[amazon-paapi] ${queryList.length} keyword searches × ${itemsPerQuery} items`);

  for (let i = 0; i < queryList.length; i++) {
    const keywords = queryList[i]!;
    const items = await amazonPaapiSearchItems(keywords, itemsPerQuery);
    for (const row of items) {
      const url = row.DetailPageURL;
      const title = row.ItemInfo?.Title?.DisplayValue;
      const image = row.Images?.Primary?.Medium?.URL;
      const price = row.Offers?.Listings?.[0]?.Price?.Amount;
      if (!url || !title || !image || price == null) continue;
      const key = url.split("?")[0]!.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      products.push({
        id: makeProductId("amazon", url),
        retailer: "amazon",
        retailer_domain: "amazon.com",
        title: title.slice(0, 300),
        brand: null,
        category: "General",
        price,
        currency: "USD",
        image_url: image,
        product_url: url,
        availability: "in_stock",
        description: null,
        scraped_at: new Date().toISOString(),
      });
    }
    if (i < queryList.length - 1) await sleep(1100);
  }

  console.log(`[amazon-paapi] collected ${products.length} products`);
  return products;
}
