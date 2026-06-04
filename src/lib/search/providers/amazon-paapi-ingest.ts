import "server-only";

import { prisma } from "../../db/prisma";
import { amazonPaapiSearchItems } from "./amazon-paapi";
import { canonicalizeBrand } from "../../identity/normalize-brand";
import type { ShoppingIntent } from "../../types";

const QUOTE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PaapiItem {
  ASIN?: string;
  DetailPageURL?: string;
  ItemInfo?: { Title?: { DisplayValue?: string } };
  Images?: { Primary?: { Medium?: { URL?: string } } };
  Offers?: { Listings?: Array<{ Price?: { Amount?: number; DisplayAmount?: string } }> };
  ItemInfo2?: {
    Classifications?: { Binding?: { DisplayValue?: string } };
  };
}

function parsePrice(item: PaapiItem): number | null {
  const listing = (item as { Offers?: { Listings?: Array<{ Price?: { Amount?: number; DisplayAmount?: string } }> } }).Offers?.Listings?.[0];
  const amount = listing?.Price?.Amount;
  if (typeof amount === "number" && amount > 0) return Math.round(amount * 100) / 100;
  const display = listing?.Price?.DisplayAmount ?? "";
  const m = display.replace(/,/g, "").match(/([\d]+(?:\.\d{2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "product";
}

function buildProductUrl(asin: string, tag: string): string {
  return `https://www.amazon.com/dp/${asin}?tag=${tag}`;
}

/**
 * Ingests a single Amazon PAAPI item into Product + PriceQuote, upserting both.
 * - Product.catalogId = "amazon-{ASIN}"
 * - PriceQuote.expiresAt = 24h from now
 * - PriceQuote.source = "amazon_paapi"
 *
 * Returns the PriceQuote id on success, null on failure.
 */
export async function ingestAmazonPaapiItem(
  item: PaapiItem,
  affiliateTag: string,
): Promise<string | null> {
  const asin = item.ASIN?.trim();
  const url = item.DetailPageURL ?? (asin ? buildProductUrl(asin, affiliateTag) : null);
  if (!asin || !url) return null;

  const price = parsePrice(item);
  if (!price) return null;

  const title = item.ItemInfo?.Title?.DisplayValue?.trim() || "Amazon Product";
  const imageUrl = item.Images?.Primary?.Medium?.URL ?? null;
  const catalogId = `amazon-${asin}`;
  const slug = slugify(title);

  const product = await prisma.product.upsert({
    where: { catalogId },
    create: {
      catalogId,
      slug,
      title,
      brand: "Amazon",
      brandCanonical: null,
      brandRaw: null,
      upc: null,
      gtin: null,
      category: "general",
      sizeLabel: "1 unit",
      basePriceUsd: price,
      unitLabel: "each",
      imageUrl,
      keywordsJson: "[]",
      organic: false,
    },
    update: {
      title,
      imageUrl,
      basePriceUsd: price,
      updatedAt: new Date(),
    },
  });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_MS);
  const affiliateUrl = buildProductUrl(asin, affiliateTag);

  const quote = await prisma.priceQuote.create({
    data: {
      productId: product.id,
      retailerId: "amazon",
      channel: "online",
      storeTitle: title,
      imageUrl,
      priceUsd: price,
      wasPriceUsd: null,
      shippingUsd: 0,
      estimatedTaxUsd: null,
      deliveredTotalUsd: price,
      landedCostUsd: price,
      unitPriceUsd: price,
      inStock: true,
      matchConfidence: 0.95,
      identityConfidence: 0.95,
      source: "amazon_paapi",
      providerSource: "amazon_paapi",
      sourceLabel: "Amazon",
      externalOfferId: asin,
      productUrl: url,
      affiliateUrl,
      fetchedAt: now,
      expiresAt,
      confidenceReasonsJson: "[]",
    },
  });

  return quote.id;
}

/**
 * Searches Amazon PAAPI for the given intent query and upserts matching results
 * into Product + PriceQuote tables.
 *
 * Requires env vars: AMAZON_PA_API_ACCESS_KEY, AMAZON_PA_API_SECRET_KEY, AMAZON_PA_API_PARTNER_TAG
 *
 * Returns count of quotes upserted.
 */
export async function ingestAmazonPaapiForIntent(
  intent: ShoppingIntent,
  itemCount = 5,
): Promise<{ ingested: number; skipped: number }> {
  const tag = process.env.AMAZON_PA_API_PARTNER_TAG?.trim() || process.env.AFFILIATE_AMAZON_TAG?.trim();
  if (!tag) {
    console.warn("[amazon-paapi-ingest] AMAZON_PA_API_PARTNER_TAG not set — skipping ingest");
    return { ingested: 0, skipped: 0 };
  }

  const query = intent.query.trim();
  if (!query) return { ingested: 0, skipped: 0 };

  const items = await amazonPaapiSearchItems(query, itemCount, { enrichment: true });

  let ingested = 0;
  let skipped = 0;
  for (const item of items) {
    try {
      const id = await ingestAmazonPaapiItem(item as PaapiItem, tag);
      if (id) ingested++;
      else skipped++;
    } catch (e) {
      console.error("[amazon-paapi-ingest] failed to upsert item", item, e);
      skipped++;
    }
  }

  return { ingested, skipped };
}
