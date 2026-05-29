import { prisma } from "../db/prisma";
import { offersToStoredRows } from "../indexing/offer-rows";
import { startOfNextLocalDay } from "../indexing/expiry";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, ProductSearchResults, ShoppingIntent } from "../types";
import { filterOffersForPersist } from "../offers/offer-persist-validation";
import { enrichmentReportEnabled } from "../offers/enrichment-report";

/**
 * Replace stale estimate/index rows with verified PDP scrape for these retailers.
 * Only validated scraped offers are written.
 */
export async function persistScrapedQuotesForCatalog(
  catalogId: string,
  offers: ProductOffer[],
  item?: CatalogItem,
  intent?: ShoppingIntent,
): Promise<number> {
  let scraped = offers.filter((o) => o.priceSource === "scraped" || o.priceSource === "connector_api");

  if (item) {
    const { accepted, rejected } = filterOffersForPersist(scraped, item, intent);
    scraped = accepted;
    if (enrichmentReportEnabled() && rejected.length) {
      console.log("[persist-scraped] rejected", catalogId, {
        count: rejected.length,
        reasons: rejected.slice(0, 10).map((r) => ({
          retailer: r.offer.retailer,
          reason: r.result.reason,
          detail: r.result.detail,
        })),
      });
    }
  }

  if (!scraped.length) return 0;

  const product = await prisma.product.findUnique({
    where: { catalogId },
    select: { id: true },
  });
  if (!product) return 0;

  const results: ProductSearchResults = {
    online: scraped,
    local: [],
    zipCode: "78701",
  };
  const rows = offersToStoredRows(results, "scraped", {
    item,
    intent,
    validatedOnly: false,
  }).filter((r) => r.source === "scraped" || r.source === "connector_api");
  if (!rows.length) return 0;

  const retailerIds = [...new Set(rows.map((r) => r.retailerId))];
  await prisma.priceQuote.deleteMany({
    where: {
      productId: product.id,
      retailerId: { in: retailerIds },
      source: {
        in: [
          "scraped",
          "catalog_estimate",
          "catalog_model",
          "daily_index",
          "nightly_index",
          "cached_quote",
        ],
      },
    },
  });

  const expiresAt = startOfNextLocalDay();
  const now = new Date();

  await prisma.priceQuote.createMany({
    data: rows.map((o) => ({
      productId: product.id,
      retailerId: o.retailerId,
      channel: o.channel,
      storeTitle: o.storeTitle,
      imageUrl: o.imageUrl,
      priceUsd: o.priceUsd,
      wasPriceUsd: o.wasPriceUsd,
      landedCostUsd: o.landedCostUsd,
      unitPriceUsd: o.unitPriceUsd,
      inStock: o.inStock,
      matchConfidence: o.matchConfidence,
      identityConfidence: o.identityConfidence,
      attributeConfidence: o.attributeConfidence,
      imageConfidence: o.imageConfidence,
      confidenceReasonsJson: o.confidenceReasonsJson,
      variantGroupId: o.variantGroupId,
      variantId: o.variantId,
      source: o.source,
      productUrl: o.productUrl,
      affiliateUrl: o.affiliateUrl,
      fetchedAt: new Date(o.priceAsOf ?? now.toISOString()),
      expiresAt,
    })),
  });

  if (process.env.PIPELINE_DEBUG === "1") {
    for (const o of rows) {
      console.log("[persist-scraped]", catalogId, o.retailerId, {
        dbPrice: o.priceUsd,
        imageUrl: o.imageUrl?.slice(0, 80),
        productUrl: o.productUrl?.slice(0, 100),
      });
    }
  }

  return rows.length;
}
