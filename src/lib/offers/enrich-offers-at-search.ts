import type { CatalogItem } from "../retailers/catalog";
import { buildFullSearchQuery } from "../shopping/intent-merge";
import { buildOfferClickUrl } from "../retailers/retailer-url";
import type {
  ProductOffer,
  ProductSearchResults,
  RetailerId,
  ShoppingIntent,
} from "../types";
import { fetchRetailerPageData } from "./retailer-page-extract";
import {
  applyRetailerExtractionToOffer,
  applyOfferQualityGates,
} from "./offer-quality";
import { classifyProductUrl, isPdpProductUrl } from "./url-classifier";
import { persistScrapedQuotesForCatalog } from "../search/persist-scraped-quotes";
import { attachPipelineDebug } from "./offer-pipeline-meta";
import { applyOfferImageFallback } from "./offer-image-fallback";
import {
  validateAndFixOfferUrl,
  urlValidationEnabled,
} from "./offer-url-validation";
import {
  createEnrichmentReport,
  finalizeEnrichmentReport,
  logEnrichmentReport,
  recordEnrichmentAttempt,
  recordPersistRejections,
} from "./enrichment-report";
import { applyFinalOfferValidation } from "./offer-final-validation";
import { logAmazonMatchDecision, validateAmazonOffer } from "./amazon-validation";
import { applyOfferFreshness } from "./offer-freshness";
import { inferRetailerStatus } from "./retailer-enrichment-status";
import { recordRetailerFetchOutcome, prioritizeRetailersByHealth } from "../retailers/health/retailer-health";
import {
  logPipelineDebug,
  pipelineDebugEnabled,
  rowFromOffer,
  type PipelineDebugRow,
} from "./pipeline-debug";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function searchOfferScrapeEnabled(): boolean {
  const raw = process.env.SEARCH_SCRAPE_OFFERS?.trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return false;
  return true;
}

function maxRetailers(): number {
  const raw = process.env.SEARCH_SCRAPE_MAX?.trim();
  const n = raw ? parseInt(raw, 10) : 10;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 12) : 10;
}

function delayMs(): number {
  const raw = process.env.SEARCH_SCRAPE_DELAY_MS?.trim();
  const n = raw ? parseInt(raw, 10) : 350;
  return Number.isFinite(n) && n >= 0 ? n : 350;
}

function needsScrape(o: ProductOffer): boolean {
  return (
    o.priceSource === "catalog_model" ||
    o.priceSource === "daily_index" ||
    o.priceSource === "cached_quote" ||
    o.priceSource === "nightly_index" ||
    !o.imageUrl?.startsWith("https://") ||
    classifyProductUrl(o.productUrl) !== "pdp" ||
    !o.price ||
    o.price <= 0
  );
}

/**
 * Fetch PDP price/image at search time — deterministic retailer order.
 */
export async function enrichOffersAtSearch(
  results: ProductSearchResults,
  item: CatalogItem,
  intent: ShoppingIntent,
): Promise<ProductSearchResults> {
  const searchQ = buildFullSearchQuery(intent);
  let offers = [...results.online];

  offers = offers.map((o) => {
    const links = buildOfferClickUrl(o.retailer, item, intent, o.productUrl);
    return applyOfferImageFallback(
      attachPipelineDebug(
        {
          ...o,
          productUrl: links.productUrl,
          affiliateUrl: links.affiliateUrl,
          pipelineDebug: {
            priceBadge: "estimated",
            source: o.priceSource ?? "catalog_model",
            validationStatus: "pending",
            imageFallbackLevel: 5,
            cacheHit: o.priceSource === "cached_quote",
          },
        },
        { cacheHit: o.priceSource === "scraped" || o.priceSource === "connector_api" },
      ),
      item,
      searchQ,
    );
  });

  if (!searchOfferScrapeEnabled()) {
    return { ...results, online: offers, local: [] };
  }

  const debugRows: PipelineDebugRow[] = [];
  const enrichmentReport = createEnrichmentReport(item.id, "search");
  const reportStarted = Date.now();

  const byRetailer = new Map<RetailerId, ProductOffer>();
  for (const o of offers) {
    if (!byRetailer.has(o.retailer)) byRetailer.set(o.retailer, o);
  }

  const targets = prioritizeRetailersByHealth(
    [...byRetailer.values()]
      .filter(needsScrape)
      .map((o) => o.retailer),
  )
    .map((id) => byRetailer.get(id)!)
    .slice(0, maxRetailers());

  for (const offer of targets) {
    const before = { ...offer };
    debugRows.push(
      rowFromOffer(before, "before-scrape", {
        note: `urlKind=${classifyProductUrl(before.productUrl)}`,
      }),
    );

    const fetchStarted = Date.now();
    const page = await fetchRetailerPageData(offer.productUrl, offer.retailer, {
      catalogItem: item,
      intent,
    });
    const fetchMs = Date.now() - fetchStarted;

    if (!page) {
      recordRetailerFetchOutcome(offer.retailer, false, false, "fetch_failed");
      const failed = attachPipelineDebug(offer, {
        validationStatus: "rejected",
        rejectedReason: "fetch_failed",
        extractionMethod: "retailer_page",
        retailerStatus: inferRetailerStatus({
          retailerId: offer.retailer,
          fetchOk: false,
          fetchReason: "fetch_failed",
          parserRan: false,
          parserFoundMatch: false,
        }),
      });
      Object.assign(offer, failed);
      recordEnrichmentAttempt(enrichmentReport, {
        retailer: offer.retailer,
        status: inferRetailerStatus({
          retailerId: offer.retailer,
          fetchOk: false,
          fetchReason: "fetch_failed",
          parserRan: false,
          parserFoundMatch: false,
        }),
        fetchOk: false,
        fetchMs,
        fetchReason: "fetch_failed",
        parserSuccess: false,
        rejectionReason: "fetch_failed",
      });
      debugRows.push(rowFromOffer(offer, "scrape-failed", { note: "fetch_failed" }));
      await sleep(delayMs());
      continue;
    }

    debugRows.push({
      retailer: offer.retailer,
      stage: "extracted",
      rawPrice: page.priceUsd,
      rawImage: page.imageUrl,
      productUrl: page.canonicalPdpUrl ?? page.finalUrl,
      note: `urlKind=${page.urlKind}`,
    });

    const patched = applyRetailerExtractionToOffer(offer, page, item);
    const now = new Date().toISOString();
    Object.assign(
      offer,
      attachPipelineDebug(
        { ...patched, priceAsOf: now },
        {
          extractionMethod: "json_ld_meta_pdp",
          scrapeTimestamp: now,
          imageExtractionMethod: page.imageUrl ? "pdp_html" : undefined,
        },
      ),
    );

    if (offer.retailer === "amazon") {
      const amazonMetrics = validateAmazonOffer(offer, item, intent);
      enrichmentReport.amazon = amazonMetrics;
      logAmazonMatchDecision(item.id, amazonMetrics, "search");
    }

    const parserFoundMatch = Boolean(
      page.searchResolved || page.canonicalPdpUrl || page.priceUsd || page.imageUrl,
    );
    const retailerStatus = inferRetailerStatus({
      retailerId: offer.retailer,
      fetchOk: true,
      parserRan: true,
      parserFoundMatch,
      matchConfidence: offer.matchConfidence,
    });

    recordRetailerFetchOutcome(offer.retailer, true, parserFoundMatch);

    if (!page.priceUsd) {
      attachPipelineDebug(offer, {
        rejectedReason: "scrape_no_price",
        validationStatus: "rejected",
        retailerStatus: retailerStatus === "success" ? "no_match" : retailerStatus,
      });
    }

    recordEnrichmentAttempt(enrichmentReport, {
      retailer: offer.retailer,
      status: retailerStatus,
      fetchOk: true,
      fetchMs,
      parserSuccess: parserFoundMatch,
      adapterConfidence: offer.matchConfidence,
      price: offer.price,
      pdpUrl: offer.productUrl,
      hasImage: Boolean(offer.imageUrl),
      resolvedVia: page.resolvedVia,
      rejectionReason: offer.pipelineDebug?.rejectedReason,
    });

    debugRows.push(
      rowFromOffer(offer, "after-scrape", {
        rawPrice: page.priceUsd,
        normalizedPrice: offer.price,
        priceSource: offer.priceSource,
        note: isPdpProductUrl(offer.productUrl) ? "pdp" : "still-search",
      }),
    );

    await sleep(delayMs());
  }

  if (urlValidationEnabled()) {
    const validated: ProductOffer[] = [];
    for (const o of offers) {
      validated.push(await validateAndFixOfferUrl(o));
      await sleep(80);
    }
    offers = validated;
  }

  offers = offers.map((o) =>
    applyOfferImageFallback(applyOfferQualityGates(o, item, intent), item, searchQ),
  );

  const finalPass = applyFinalOfferValidation(offers, item, intent, enrichmentReport.attempts);
  offers = finalPass.offers.map(applyOfferFreshness);

  recordPersistRejections(
    enrichmentReport,
    finalPass.persistRejected.map((r) => ({
      offer: r.offer,
      result: {
        ok: false,
        reason: r.reason as import("./offer-persist-validation").PersistRejectionReason,
        detail: r.detail,
      },
    })),
  );
  finalizeEnrichmentReport(
    enrichmentReport,
    finalPass.persistable,
    finalPass.displayable,
    reportStarted,
  );
  logEnrichmentReport(enrichmentReport, item);

  if (pipelineDebugEnabled()) {
    logPipelineDebug(item.id, debugRows);
    for (const o of offers) {
      console.log("[offer-pipeline]", item.id, o.retailer, {
        source: o.priceSource,
        price: o.price,
        image: o.imageUrl?.slice(0, 70),
        fallback: o.pipelineDebug?.imageFallbackLevel,
        url: o.productUrl?.slice(0, 90),
        validation: o.pipelineDebug?.urlValidation,
        retailerStatus: o.pipelineDebug?.retailerStatus,
        rejected: o.pipelineDebug?.persistRejectionReason,
      });
    }
  }

  try {
    await persistScrapedQuotesForCatalog(item.id, finalPass.persistable, item, intent);
  } catch (e) {
    console.error("[enrich-offers-at-search] persist scraped", e);
  }

  return { ...results, online: offers, local: [] };
}
