import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, ProductSearchResults } from "../types";
import {
  applyDealIntelligenceToOffer,
  buildMarketFromOffers,
  markBestDealByScore,
  statsForOffer,
} from "./deal-score";
import { loadProductRetailerStats, recordVerifiedOfferStats } from "./price-stats-store";
import { loadPriceSparklines } from "./price-history";
import {
  getRetailerTrustScores,
  recordRetailerEnrichmentBatch,
  recordOfferPersistOutcome,
} from "./retailer-quality-store";
import type { RetailerEnrichmentAttempt } from "../offers/enrichment-report";
import { isDisplayableOffer } from "../offers/offer-persist-validation";
import { prepareResultsForDisplay } from "../offers/offer-ranking";
import { attachDealExplanations } from "../shopping/deal-explanation";
import type { ShoppingIntent } from "../types";

export interface DealIntelligenceReport {
  catalogId: string;
  marketMedian: number | null;
  marketSampleSize: number;
  displayableCount: number;
  suspiciousRejected: number;
  bestDealRetailer?: string;
  bestDealPrice?: number;
  bestDealScore?: number;
}

/**
 * Apply market comparison, deal scoring, and best-deal selection to search/index results.
 */
export async function applyDealIntelligence(
  results: ProductSearchResults,
  catalogItem: CatalogItem,
  options: {
    enrichmentAttempts?: RetailerEnrichmentAttempt[];
    recordStats?: boolean;
  } = {},
): Promise<{ results: ProductSearchResults; report: DealIntelligenceReport }> {
  const allOffers = [...results.online, ...results.local, ...(results.estimatedOnline ?? [])];
  const displayable = allOffers.filter(isDisplayableOffer);

  const [statsMap, trustScores, sparklines] = await Promise.all([
    loadProductRetailerStats(catalogItem.id),
    getRetailerTrustScores(displayable.map((o) => o.retailer)),
    loadPriceSparklines(catalogItem.id),
  ]);

  const market = buildMarketFromOffers(displayable, catalogItem.basePrice);

  let suspiciousRejected = 0;
  const patchOffer = (offer: ProductOffer): ProductOffer => {
    const before = isDisplayableOffer(offer);
    const next = applyDealIntelligenceToOffer(
      offer,
      market,
      trustScores.get(offer.retailer) ?? 0.5,
      statsForOffer(offer, statsMap),
    );
    const sparkKey = `${offer.retailer}:${offer.channel}`;
    const spark = sparklines.get(sparkKey);
    if (spark) next.priceHistorySparkline = spark;
    if (before && !isDisplayableOffer(next)) suspiciousRejected += 1;
    return next;
  };

  let online = results.online.map(patchOffer).filter(isDisplayableOffer);
  online = markBestDealByScore(online);

  const report: DealIntelligenceReport = {
    catalogId: catalogItem.id,
    marketMedian: market.marketMedian,
    marketSampleSize: market.sampleSize,
    displayableCount: online.length,
    suspiciousRejected,
    bestDealRetailer: online.find((o) => o.isBestDeal)?.retailer,
    bestDealPrice: online.find((o) => o.isBestDeal)?.price,
    bestDealScore: online.find((o) => o.isBestDeal)?.dealScore,
  };

  if (options.enrichmentAttempts?.length) {
    await recordRetailerEnrichmentBatch(options.enrichmentAttempts).catch(() => {});
  }

  if (options.recordStats !== false && online.length) {
    await recordVerifiedOfferStats(catalogItem.id, online).catch(() => {});
    for (const o of online) {
      await recordOfferPersistOutcome(o.retailer, true, o.matchConfidence).catch(() => {});
    }
  }

  if (process.env.PIPELINE_DEBUG === "1" || process.env.INDEX_ENRICHMENT_REPORT === "1") {
    console.log("[deal-intelligence]", catalogItem.id, report, {
      offers: online.map((o) => ({
        retailer: o.retailer,
        price: o.price,
        dealScore: o.dealScore,
        pctBelowMarket: o.percentBelowMarket,
        best: o.isBestDeal,
      })),
    });
  }

  return {
    results: {
      ...results,
      online,
      local: [],
      estimatedOnline: results.estimatedOnline ?? [],
    },
    report,
  };
}

/** Score deals, record stats, then apply display filtering/ranking. */
export async function finalizeResultsForUser(
  results: ProductSearchResults,
  catalogItem: CatalogItem,
  intent: ShoppingIntent,
  options: {
    enrichmentAttempts?: RetailerEnrichmentAttempt[];
    recordStats?: boolean;
  } = {},
): Promise<ProductSearchResults> {
  const { results: scored } = await applyDealIntelligence(results, catalogItem, options);
  const explained = {
    ...scored,
    online: attachDealExplanations(scored.online),
  };
  return prepareResultsForDisplay(explained, { item: catalogItem, intent });
}
