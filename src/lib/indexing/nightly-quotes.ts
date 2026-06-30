import { prisma } from "../db/prisma";
import { compareProduct } from "../retailers/catalog";
import { mergeLivePrices } from "../search/merge-live-prices";
import { fetchAmazonLiveQuotes } from "../search/providers/amazon-paapi";
import { isAmazonPaapiConfigured } from "../search/providers/amazon-paapi-config";
import { finalizeSearchPrices } from "../search/price-truth";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductSearchResults, RetailerId, ShoppingIntent } from "../types";
import { finalizePricesWithHistory } from "../pricing/apply-pricing-pipeline";
import { DAILY_INDEX_SOURCE } from "../own-db/config";
import { startOfNextLocalDay } from "./expiry";
import { enrichIndexSearchResults, type EnrichedIndexImagesReport } from "./enrich-offer-images";
import { offersToStoredRows } from "./offer-rows";
import { shuffleInPlace } from "./shuffle";
import { resolveCatalogRow } from "../catalog/resolve-variant";
import { compareByRefreshPriority } from "../identity/popularity";
import {
  getWeeklyRotationPlan,
  type WeeklyRotationPlan,
} from "./weekly-retailer-schedule";
import {
  formatDurationMs,
  indexLog,
  indexLogAlways,
} from "./index-progress";
import {
  initIndexTelemetry,
  recordIndexProductResult,
  finalizeIndexTelemetry,
  setCategoryTotals,
} from "./index-telemetry";
import { indexOfferEnrichmentEnabled } from "../offers/enrich-index-offers";
import { indexVariantGroupImagesEnabled } from "./index-variant-group-images";
import {
  getIndexRetailerRunSummary,
  resetIndexRetailerSummary,
  formatIndexRetailerSummaryMarkdown,
} from "./index-retailer-summary";
import { computePersistExpiresAt, consumerVisibleQuoteCutoff } from "../pricing/quote-freshness-policy";
import { saveIndexRunArtifact } from "./index-run-artifact";
import { persistAmazonPaapiIdentity } from "../offers/offer-metadata-persist";

const NIGHTLY_SOURCE = DAILY_INDEX_SOURCE;

export async function purgeExpiredPriceQuotes(): Promise<number> {
  // Age-based off fetchedAt + the CURRENT retention policy (not the stored
  // `expiresAt` snapshot, which was written under the old 14d horizon). This lets
  // us extend retention for graceful stale degradation without a backfill, and
  // keeps offers queryable+labeled for the full hardExpire window. Quotes are
  // only deleted once they're older than even the stale-visible horizon.
  const cutoff = consumerVisibleQuoteCutoff();
  const result = await prisma.priceQuote.deleteMany({
    where: { fetchedAt: { lt: cutoff } },
  });
  if (result.count > 0) {
    console.log(
      `[cleanup] purgeExpiredPriceQuotes removed ${result.count} expired rows at ${new Date().toISOString()}`,
    );
  }
  return result.count;
}

export async function clearNightlyQuotesForProduct(productId: string): Promise<void> {
  await prisma.priceQuote.deleteMany({
    where: {
      productId,
      source: {
        in: [NIGHTLY_SOURCE, "catalog_estimate", "nightly_index"],
      },
    },
  });
}

async function clearNightlyQuotesForRetailers(
  productId: string,
  retailerIds: string[],
): Promise<void> {
  if (!retailerIds.length) return;
  await prisma.priceQuote.deleteMany({
    where: {
      productId,
      source: NIGHTLY_SOURCE,
      retailerId: { in: retailerIds },
    },
  });
}

export async function persistNightlySearchResults(
  catalogId: string,
  results: ProductSearchResults,
  expiresAt: Date,
  options: {
    partialRetailers?: boolean;
    item?: CatalogItem;
    intent?: ShoppingIntent;
  } = {},
): Promise<number> {
  const product = await prisma.product.findUnique({
    where: { catalogId },
    select: { id: true },
  });
  if (!product) return 0;

  const rows = offersToStoredRows(results, NIGHTLY_SOURCE, {
    item: options.item,
    intent: options.intent,
    validatedOnly: true,
  });
  if (!rows.length) {
    indexLog("persist: zero verified offers — preserving existing quotes", {
      catalogId,
    });
    return 0;
  }

  const retailerIds = [...new Set(rows.map((r) => r.retailerId))];
  await clearNightlyQuotesForRetailers(product.id, retailerIds);

  const now = new Date();

  await prisma.priceQuote.createMany({
    data: rows.map((o) => {
      const fetched = new Date(o.priceAsOf ?? now.toISOString());
      return {
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
      fetchedAt: fetched,
      expiresAt: computePersistExpiresAt(fetched, o.retailerId as RetailerId),
    };
    }),
  });

  return rows.length;
}

function intentForCatalogItem(item: CatalogItem): ShoppingIntent {
  return {
    query: [item.brand, item.title].filter(Boolean).join(" ").trim(),
    category: item.category,
    zipCode: "78701",
  };
}

/**
 * Pre-compute one product’s compare grid for tonight’s store batch.
 */
export async function indexCatalogItemNightly(
  item: CatalogItem,
  expiresAt: Date,
  retailersTonight: RetailerId[],
  partialRetailers: boolean,
): Promise<{
  offerCount: number;
  retailerImagesFetched?: number;
  variantGroupsIndexed?: number;
  imageCacheHits?: number;
  offerEnrichment?: EnrichedIndexImagesReport["offerEnrichment"];
}> {
  const itemStarted = Date.now();
  const intent = intentForCatalogItem(item);
  const { item: resolvedItem } = resolveCatalogRow(item, intent);
  const allow = new Set(retailersTonight);

  indexLog("product: compare grid", { catalogId: item.id, retailers: retailersTonight.length });
  let results = compareProduct(item, intent, { retailers: retailersTonight });
  results = finalizeSearchPrices(results);

  if (isAmazonPaapiConfigured() && allow.has("amazon")) {
    indexLog("product: amazon PA-API (primary)", { catalogId: item.id });
    const amazonStarted = Date.now();
    const amazonQuotes = (await fetchAmazonLiveQuotes(intent, resolvedItem)).filter((q) =>
      allow.has(q.retailerId),
    );
    indexLog("product: amazon PA-API done", {
      catalogId: item.id,
      quotes: amazonQuotes.length,
      elapsed: formatDurationMs(Date.now() - amazonStarted),
    });
    if (amazonQuotes.length > 0) {
      const merged = mergeLivePrices(
        results,
        amazonQuotes,
        resolvedItem,
        intent,
        "connector_api",
      );
      results = finalizeSearchPrices(merged.results);

      const product = await prisma.product.findUnique({
        where: { catalogId: item.id },
        select: { id: true },
      });
      if (product) {
        for (const offer of [...results.online, ...results.local]) {
          if (offer.retailer === "amazon" && offer.priceSource === "connector_api") {
            await persistAmazonPaapiIdentity({
              productDbId: product.id,
              item: resolvedItem,
              offer,
            });
          }
        }
      }
    }
  }

  indexLog("product: images + PDP enrich", {
    catalogId: item.id,
    offerEnrichment: indexOfferEnrichmentEnabled(),
    variantGroupImages: indexVariantGroupImagesEnabled(),
  });
  const imageStarted = Date.now();
  const imagePass = await enrichIndexSearchResults(results, resolvedItem, intent);
  results = imagePass.results;
  indexLog("product: images done", {
    catalogId: item.id,
    elapsed: formatDurationMs(Date.now() - imageStarted),
    retailerImagesFetched: imagePass.retailerImagesFetched,
    offerEnrichment: imagePass.offerEnrichment,
  });

  indexLog("product: price history", { catalogId: item.id });
  results = await finalizePricesWithHistory(resolvedItem.id, results, {
    recordSnapshot: true,
    snapshotSource: NIGHTLY_SOURCE,
  });

  indexLog("product: persist quotes", { catalogId: item.id });
  const offerCount = await persistNightlySearchResults(
    item.id,
    results,
    expiresAt,
    { partialRetailers, item: resolvedItem, intent },
  );
  indexLog("product: done", {
    catalogId: item.id,
    offers: offerCount,
    elapsed: formatDurationMs(Date.now() - itemStarted),
  });

  return {
    offerCount,
    retailerImagesFetched: imagePass.retailerImagesFetched,
    variantGroupsIndexed: imagePass.variantGroupsIndexed,
    imageCacheHits: imagePass.imageCacheHits,
    offerEnrichment: imagePass.offerEnrichment,
  };
}

export interface NightlyIndexReport {
  productsIndexed: number;
  offersWritten: number;
  retailerImagesFetched: number;
  variantGroupsIndexed: number;
  imageCacheHits: number;
  offerEnrichment?: {
    offersEnriched: number;
    pdpUrlsResolved: number;
    imagesFetched: number;
    pricesExtracted: number;
  };
  expiredPurged: number;
  amazonPaapi: boolean;
  expiresAt: string;
  weeklyRotation: boolean;
  weekday: number;
  weekdayName: string;
  retailersTonight: number;
  totalRetailers: number;
  telemetry?: import("./index-telemetry").IndexTelemetrySnapshot | null;
  retailerSummary?: import("./index-retailer-summary").IndexRetailerRunSummary;
}

export interface NightlyIndexOptions {
  category?: string;
  limit?: number;
  delayMs?: number;
  /** Index only these catalog IDs (preserves order). */
  catalogIds?: string[];
  /** Restrict to flagship UPC-heavy grocery set. */
  flagshipOnly?: boolean;
  /** Override rotation (testing). */
  rotationPlan?: WeeklyRotationPlan;
}

export async function runNightlyPriceIndex(
  options: NightlyIndexOptions = {},
): Promise<NightlyIndexReport> {
  indexLogAlways("loading catalog module…");
  resetIndexRetailerSummary();
  const { CATALOG } = await import("../retailers/catalog");
  const { ensureCatalogSynced } = await import("../db/catalog-sync");
  indexLogAlways("catalog module loaded", { products: CATALOG.length });

  const plan = options.rotationPlan ?? getWeeklyRotationPlan();
  indexLogAlways("purge expired quotes…");
  const purgeStarted = Date.now();
  const expiredPurged = await purgeExpiredPriceQuotes();
  indexLogAlways("purge done", {
    removed: expiredPurged,
    elapsed: formatDurationMs(Date.now() - purgeStarted),
  });

  if (process.env.SKIP_CATALOG_SYNC === "1") {
    indexLogAlways("SKIP_CATALOG_SYNC=1 — skipping ensureCatalogSynced");
  } else {
    await ensureCatalogSynced();
  }

  const expiresAt =
    plan.enabled ? plan.expiresAt : startOfNextLocalDay();

  let items = [...CATALOG];
  if (options.category) {
    items = items.filter((i) => i.category === options.category);
  }

  const flagshipOnly =
    options.flagshipOnly ?? process.env.INDEX_FLAGSHIP_ONLY?.trim().toLowerCase() === "on";
  if (flagshipOnly) {
    const { getFlagshipCatalogIds } = await import("../inventory/flagship-catalog");
    const allow = new Set(getFlagshipCatalogIds());
    items = items.filter((i) => allow.has(i.id));
    indexLogAlways("flagship-only mode", { products: items.length });
  }

  if (options.catalogIds?.length) {
    const allow = new Set(options.catalogIds);
    items = items.filter((i) => allow.has(i.id));
    const order = new Map(options.catalogIds.map((id, idx) => [id, idx]));
    items.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }

  const popularityRows = await prisma.product.findMany({
    select: {
      catalogId: true,
      popularityScore: true,
      searchFrequency: true,
      clickFrequency: true,
      refreshPriority: true,
    },
  });
  const popByCatalog = new Map(popularityRows.map((r) => [r.catalogId, r]));
  items.sort((a, b) =>
    compareByRefreshPriority(
      popByCatalog.get(a.id) ?? {},
      popByCatalog.get(b.id) ?? {},
    ),
  );
  shuffleInPlace(items.slice(Math.min(12, items.length)));

  if (options.limit && options.limit > 0) {
    items = items.slice(0, options.limit);
  }

  const scrapeSkip = process.env.INDEX_SCRAPE_SKIP_RETAILERS?.trim();
  indexLogAlways("index plan", {
    productsToIndex: items.length,
    retailersTonight: plan.retailersTonight.length,
    fullRotation: !plan.enabled,
    delayMsPerProduct: options.delayMs ?? 350,
    indexFetchRetailerImages: process.env.INDEX_FETCH_RETAILER_IMAGES ?? "(default on)",
    indexOfferEnrichment: indexOfferEnrichmentEnabled(),
    indexScrapeSkipRetailers: scrapeSkip || "hm (default)",
    amazonPaapi: isAmazonPaapiConfigured(),
  });

  const delayMs = options.delayMs ?? 350;
  let productsIndexed = 0;
  const loopStarted = Date.now();
  let offersWritten = 0;
  let retailerImagesFetched = 0;
  let variantGroupsIndexed = 0;
  let imageCacheHits = 0;
  let offerEnrichmentTotals = {
    offersEnriched: 0,
    pdpUrlsResolved: 0,
    imagesFetched: 0,
    pricesExtracted: 0,
  };

  initIndexTelemetry(items.length);
  const categoryTotals: Record<string, number> = {};
  for (const item of items) {
    categoryTotals[item.category] = (categoryTotals[item.category] ?? 0) + 1;
  }
  setCategoryTotals(categoryTotals);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]!;
    indexLogAlways(`product ${idx + 1}/${items.length}`, {
      catalogId: item.id,
      title: item.title.slice(0, 48),
    });
    const productStarted = Date.now();
    const {
      offerCount,
      retailerImagesFetched: imgCount,
      variantGroupsIndexed: gCount,
      imageCacheHits: cHits,
      offerEnrichment: oe,
    } = await indexCatalogItemNightly(
      item,
      expiresAt,
      plan.retailersTonight,
      plan.enabled,
    );
    if (offerCount > 0) {
      productsIndexed += 1;
      offersWritten += offerCount;
      retailerImagesFetched += imgCount ?? 0;
      variantGroupsIndexed += gCount ?? 0;
      imageCacheHits += cHits ?? 0;
      if (oe) {
        offerEnrichmentTotals.offersEnriched += oe.offersEnriched;
        offerEnrichmentTotals.pdpUrlsResolved += oe.pdpUrlsResolved;
        offerEnrichmentTotals.imagesFetched += oe.imagesFetched;
        offerEnrichmentTotals.pricesExtracted += oe.pricesExtracted;
      }
    }
    const loopElapsed = Date.now() - loopStarted;
    const done = idx + 1;
    const avgMs = loopElapsed / done;
    const etaMs = avgMs * (items.length - done);

    const rejections =
      oe ?
        Math.max(0, (oe.offersEnriched ?? 0) - (oe.pricesExtracted ?? 0))
      : 0;

    recordIndexProductResult({
      category: item.category,
      offerCount,
      rejections,
      retailersAttempted: plan.retailersTonight.length,
      elapsedMs: Date.now() - productStarted,
      productsDone: done,
      productsTotal: items.length,
      loopElapsedMs: loopElapsed,
      bottleneck:
        offerCount === 0 ? "no_verified_offers_persisted"
        : (imgCount ?? 0) === 0 && indexVariantGroupImagesEnabled() ?
          "image_fetch"
        : "ok",
    });

    indexLogAlways("progress", {
      done: `${done}/${items.length}`,
      elapsed: formatDurationMs(loopElapsed),
      eta: formatDurationMs(etaMs),
      lastProductSec: formatDurationMs(avgMs),
    });

    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  indexLogAlways("index loop finished", {
    productsIndexed,
    offersWritten,
    elapsed: formatDurationMs(Date.now() - loopStarted),
  });

  const telemetry = finalizeIndexTelemetry();
  const retailerSummary = getIndexRetailerRunSummary();

  await saveIndexRunArtifact({
    report: {
      productsIndexed,
      offersWritten,
      amazonPaapi: isAmazonPaapiConfigured(),
      retailersTonight: plan.retailersTonight.length,
      totalRetailers: plan.totalRetailers,
      telemetry,
      retailerSummary,
    },
    retailerSummaryMarkdown: formatIndexRetailerSummaryMarkdown(retailerSummary),
  }).catch((e) => {
    indexLogAlways("artifact save failed", { error: String(e) });
  });

  return {
    productsIndexed,
    offersWritten,
    retailerImagesFetched,
    variantGroupsIndexed,
    imageCacheHits,
    offerEnrichment:
      offerEnrichmentTotals.offersEnriched > 0 ? offerEnrichmentTotals : undefined,
    expiredPurged,
    amazonPaapi: isAmazonPaapiConfigured(),
    expiresAt: expiresAt.toISOString(),
    weeklyRotation: plan.enabled,
    weekday: plan.weekday,
    weekdayName: plan.weekdayName,
    retailersTonight: plan.retailersTonight.length,
    totalRetailers: plan.totalRetailers,
    telemetry,
    retailerSummary,
  };
}
