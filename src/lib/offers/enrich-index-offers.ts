import { upsertRetailerProductIdentity } from "../db/identity-store";
import { isGenericCatalogImage } from "../indexing/retailer-page-image";
import {
  isRetailerHostedImage,
  scoreProductImageUrl,
} from "../indexing/retailer-page-image";
import { scoreOfferConfidence } from "../identity/offer-confidence";
import type { CatalogItem } from "../retailers/catalog";
import type {
  ProductOffer,
  ProductSearchResults,
  RetailerId,
  ShoppingIntent,
} from "../types";
import {
  buildOfferDiagnostic,
  logImageFetchSkips,
  logOfferDiagnostics,
  type ImageFetchSkipLog,
} from "./offer-diagnostics";
import {
  createEnrichmentReport,
  finalizeEnrichmentReport,
  logEnrichmentReport,
  recordEnrichmentAttempt,
  recordPersistRejections,
  type ProductEnrichmentReport,
} from "./enrichment-report";
import { applyFinalOfferValidation } from "./offer-final-validation";
import { applyDealIntelligence } from "../pricing/deal-intelligence";
import { recordRetailerEnrichmentBatch } from "../pricing/retailer-quality-store";
import { logAmazonMatchDecision, validateAmazonOffer } from "./amazon-validation";
import {
  applyOfferQualityGates,
  applyRetailerExtractionToOffer,
  buildOfferQualityMeta,
  MIN_TRUSTED_MATCH_CONFIDENCE,
} from "./offer-quality";
import { fetchRetailerPageData } from "./retailer-page-extract";
import { pickOffersForIndexEnrich, indexScrapeSkipRetailers } from "./enrich-retailer-targets";
import { classifyProductUrl, isPdpProductUrl } from "./url-classifier";
import { inferRetailerStatus } from "./retailer-enrichment-status";
import { formatDurationMs, indexLog } from "../indexing/index-progress";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function indexOfferEnrichmentEnabled(): boolean {
  const raw = process.env.INDEX_OFFER_ENRICHMENT?.trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return false;
  const img = process.env.INDEX_FETCH_RETAILER_IMAGES?.trim().toLowerCase();
  return img !== "off" && img !== "false" && img !== "0";
}

function maxRetailersToEnrichPerProduct(): number {
  const raw = process.env.INDEX_OFFER_ENRICH_MAX?.trim();
  const n = raw ? parseInt(raw, 10) : 8;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 24) : 8;
}

function enrichDelayMs(): number {
  const raw = process.env.INDEX_OFFER_ENRICH_DELAY_MS?.trim();
  const n = raw ? parseInt(raw, 10) : 280;
  return Number.isFinite(n) && n >= 0 ? n : 280;
}

export interface IndexOfferEnrichmentReport {
  offersEnriched: number;
  pdpUrlsResolved: number;
  imagesFetched: number;
  pricesExtracted: number;
  identitiesStored: number;
  skipReasons: ImageFetchSkipLog[];
  /** Full per-product observability report (when INDEX_ENRICHMENT_REPORT=1). */
  enrichmentReport?: ProductEnrichmentReport;
  persistRejected?: number;
  displayable?: number;
}

/**
 * Per-retailer PDP enrichment for nightly index (all catalog products).
 * Explains low retailerImagesFetched when variant groups are absent.
 */
export async function enrichOffersAtIndex(
  results: ProductSearchResults,
  item: CatalogItem,
  intent: ShoppingIntent,
  productDbId?: string,
): Promise<{ results: ProductSearchResults; report: IndexOfferEnrichmentReport }> {
  const report: IndexOfferEnrichmentReport = {
    offersEnriched: 0,
    pdpUrlsResolved: 0,
    imagesFetched: 0,
    pricesExtracted: 0,
    identitiesStored: 0,
    skipReasons: [],
  };

  const enrichmentReport = createEnrichmentReport(item.id, "index");
  const reportStarted = Date.now();

  if (!indexOfferEnrichmentEnabled()) {
    const out = applyQualityToAll(results, item, intent);
    const finalPass = applyFinalOfferValidation([...out.online, ...out.local], item, intent);
    return {
      results: {
        ...out,
        online: out.online.map((o) => finalPass.offers.find((x) => x.id === o.id) ?? o),
      },
      report,
    };
  }

  const offers = [...results.online, ...results.local];
  const max = maxRetailersToEnrichPerProduct();
  const targets = pickOffersForIndexEnrich(offers, item, max);
  const skip = indexScrapeSkipRetailers();

  indexLog("PDP enrich: retailers", {
    catalogId: item.id,
    count: targets.length,
    delayMs: enrichDelayMs(),
    skipRetailers: skip.size > 0 ? [...skip] : undefined,
    retailers: targets.map(([id]) => id),
  });

  for (const [retailerId, offer] of targets) {
    const urlKind = classifyProductUrl(offer.productUrl);
    const hasRetailerImage =
      offer.imageUrl?.startsWith("https://") &&
      isRetailerHostedImage(offer.imageUrl, retailerId) &&
      !isGenericCatalogImage(offer.imageUrl) &&
      scoreProductImageUrl(offer.imageUrl) >= 0.4;

    const hasPdp = urlKind === "pdp";
    const hasScrapedPrice = offer.priceSource === "scraped" || offer.priceSource === "connector_api";

    if (hasPdp && hasRetailerImage && hasScrapedPrice) {
      report.skipReasons.push({
        retailer: retailerId,
        reason: "already-good",
        productUrl: offer.productUrl,
      });
      recordEnrichmentAttempt(enrichmentReport, {
        retailer: retailerId,
        status: "success",
        fetchOk: true,
        fetchMs: 0,
        parserSuccess: true,
        adapterConfidence: offer.matchConfidence,
        price: offer.price,
        pdpUrl: offer.productUrl,
        hasImage: true,
      });
      continue;
    }

    indexLog("PDP fetch", {
      catalogId: item.id,
      retailer: retailerId,
      urlKind,
      url: offer.productUrl.slice(0, 72),
    });
    const fetchStarted = Date.now();
    const extraction = await fetchRetailerPageData(offer.productUrl, retailerId, {
      catalogItem: item,
      intent,
    });
    const fetchMs = Date.now() - fetchStarted;

    if (!extraction) {
      const fetchReason = urlKind === "search" ? "search-page-fetch-failed" : "fetch-failed";
      indexLog("PDP fetch failed", {
        catalogId: item.id,
        retailer: retailerId,
        elapsed: formatDurationMs(fetchMs),
      });
      report.skipReasons.push({
        retailer: retailerId,
        reason: fetchReason,
        productUrl: offer.productUrl,
      });
      recordEnrichmentAttempt(enrichmentReport, {
        retailer: retailerId,
        status: inferRetailerStatus({
          retailerId,
          fetchOk: false,
          fetchReason,
          parserRan: false,
          parserFoundMatch: false,
        }),
        fetchOk: false,
        fetchMs,
        fetchReason,
        parserSuccess: false,
        rejectionReason: fetchReason,
      });
      await sleep(enrichDelayMs());
      continue;
    }

    const parserFoundMatch = Boolean(
      extraction.searchResolved ||
        extraction.canonicalPdpUrl ||
        extraction.priceUsd ||
        extraction.imageUrl,
    );

    indexLog("PDP fetch ok", {
      catalogId: item.id,
      retailer: retailerId,
      elapsed: formatDurationMs(fetchMs),
      price: extraction.priceUsd,
      hasImage: Boolean(extraction.imageUrl),
      searchResolved: extraction.searchResolved,
      resolvedVia: extraction.resolvedVia,
      pdp: extraction.canonicalPdpUrl?.slice(0, 72),
    });

    const beforeUrl = offer.productUrl;
    const baselineOffer = { ...offer };
    const patched = applyRetailerExtractionToOffer(offer, extraction, item);
    Object.assign(offer, patched);
    report.offersEnriched += 1;

    if (retailerId === "amazon") {
      const amazonMetrics = validateAmazonOffer(offer, item, intent);
      enrichmentReport.amazon = amazonMetrics;
      logAmazonMatchDecision(item.id, amazonMetrics, "index");

      if (process.env.INDEX_AMAZON_PERSIST_DIAG === "1") {
        const { traceAmazonConfidencePipeline, formatConfidencePipelineTrace } =
          await import("../audit/amazon-confidence-trace");
        const trace = traceAmazonConfidencePipeline(
          baselineOffer,
          item,
          intent,
          extraction,
        );
        console.log("[amazon-conf-trace]", formatConfidencePipelineTrace(trace));
      }
    }

    const retailerStatus = inferRetailerStatus({
      retailerId,
      fetchOk: true,
      parserRan: true,
      parserFoundMatch,
      matchConfidence: offer.matchConfidence,
    });

    recordEnrichmentAttempt(enrichmentReport, {
      retailer: retailerId,
      status: retailerStatus,
      fetchOk: true,
      fetchMs,
      parserSuccess: parserFoundMatch,
      adapterConfidence: offer.matchConfidence,
      rejectionReason: retailerStatus !== "success" ? retailerStatus : undefined,
      price: offer.price,
      pdpUrl: offer.productUrl,
      hasImage: Boolean(offer.imageUrl),
      resolvedVia: extraction.resolvedVia,
    });

    if (isPdpProductUrl(offer.productUrl) && offer.productUrl !== beforeUrl) {
      report.pdpUrlsResolved += 1;
    }
    if (
      extraction.imageUrl &&
      offer.imageUrl === extraction.imageUrl
    ) {
      report.imagesFetched += 1;
    }
    if (
      extraction.priceUsd &&
      (offer.priceSource === "scraped" || offer.priceSource === "connector_api")
    ) {
      report.pricesExtracted += 1;
    }

    if (productDbId && isPdpProductUrl(offer.productUrl)) {
      try {
        await upsertRetailerProductIdentity({
          retailerId,
          storeTitle: offer.storeTitle ?? offer.title,
          productUrl: offer.productUrl,
          retailerBrandRaw: offer.brand,
          identifiers: extraction.identifiers,
          productId: productDbId,
          rawAttributesJson: JSON.stringify({
            urlKind: classifyProductUrl(offer.productUrl),
            extractedAt: new Date().toISOString(),
          }),
        });
        report.identitiesStored += 1;
      } catch {
        /* non-fatal */
      }
    }

    await sleep(enrichDelayMs());
  }

  const out = applyQualityToAll(results, item, intent);
  const allOffers = [...out.online, ...out.local];
  const finalPass = applyFinalOfferValidation(allOffers, item, intent, enrichmentReport.attempts);

  recordPersistRejections(
    enrichmentReport,
    finalPass.persistRejected.map((r) => ({
      offer: r.offer,
      result: { ok: false, reason: r.reason as import("./offer-persist-validation").PersistRejectionReason, detail: r.detail },
    })),
  );

  finalizeEnrichmentReport(
    enrichmentReport,
    finalPass.persistable,
    finalPass.displayable,
    reportStarted,
  );
  logEnrichmentReport(enrichmentReport, item);

  await recordRetailerEnrichmentBatch(enrichmentReport.attempts).catch(() => {});

  report.enrichmentReport = enrichmentReport;
  report.persistRejected = finalPass.persistRejected.length;
  report.displayable = finalPass.displayable.length;

  if (process.env.INDEX_AMAZON_PERSIST_DIAG === "1") {
    for (const r of finalPass.persistRejected.filter((x) => x.offer.retailer === "amazon")) {
      const { diagnoseAmazonOfferPersist, formatAmazonPersistDiagnostic } = await import(
        "../audit/amazon-persist-diagnostics"
      );
      console.log(
        "[amazon-persist-diag]",
        formatAmazonPersistDiagnostic(diagnoseAmazonOfferPersist(r.offer, item, intent)),
      );
    }
  }

  const offerById = new Map(finalPass.offers.map((o) => [o.id, o]));
  let patchedResults = {
    ...out,
    online: out.online.map((o) => offerById.get(o.id) ?? o),
    local: out.local.map((o) => offerById.get(o.id) ?? o),
  };

  const dealPass = await applyDealIntelligence(patchedResults, item, {
    enrichmentAttempts: enrichmentReport.attempts,
    recordStats: true,
  });
  patchedResults = dealPass.results;
  report.displayable = dealPass.report.displayableCount;

  const diag = [...patchedResults.online, ...patchedResults.local].map(buildOfferDiagnostic);
  logOfferDiagnostics(item.id, diag, {
    ...report,
    variantGroupsOnItem: Boolean(item.variantGroups?.length),
    enrichEnabled: true,
    displayable: report.displayable,
    persistRejected: report.persistRejected,
  });
  logImageFetchSkips(item.id, report.skipReasons);

  return { results: patchedResults, report };
}

function applyQualityToAll(
  results: ProductSearchResults,
  item: CatalogItem,
  intent: ShoppingIntent,
): ProductSearchResults {
  const patch = (o: ProductOffer) => {
    const priorConf = o.matchConfidence ?? 0;
    const priorIdentity = o.identityConfidence ?? 0;
    const priorReasons = o.confidenceReasons ?? [];

    const confidence = scoreOfferConfidence(item, intent, o.retailer, {
      storeTitle: o.storeTitle,
      brand: o.brand,
      color: intent.colors?.[0],
      size: o.size,
      upc: o.upc,
      imageUrl: o.imageUrl,
      productUrl: o.productUrl,
      priceSource: o.priceSource,
    });

    const scoredReasons = JSON.parse(
      confidence.confidenceReasonsJson,
    ) as ProductOffer["confidenceReasons"];
    const mergedReasons = [...priorReasons];
    for (const r of scoredReasons ?? []) {
      if (!mergedReasons.some((x) => x.code === r.code)) mergedReasons.push(r);
    }

    let matchConfidence = confidence.matchConfidence;
    let identityConfidence = confidence.identityConfidence;
    let imageConfidence = confidence.imageConfidence;

    // Do not crush PDP-enriched verified prices back to catalog-estimate confidence.
    if (o.priceSource === "scraped" || o.priceSource === "connector_api") {
      matchConfidence = Math.max(matchConfidence, priorConf);
      identityConfidence = Math.max(identityConfidence, priorIdentity, priorConf);
      imageConfidence = Math.max(imageConfidence, o.imageConfidence ?? 0);
    }

    let next: ProductOffer = {
      ...o,
      matchConfidence,
      identityConfidence,
      attributeConfidence: confidence.attributeConfidence,
      imageConfidence,
      confidenceReasons: mergedReasons,
    };
    next.priceConfidence = buildOfferQualityMeta(next).priceConfidence;
    next = applyOfferQualityGates(next, item, intent);

    // Preserve Amazon-validated scraped confidence through quality gates.
    if (
      (o.priceSource === "scraped" || o.priceSource === "connector_api") &&
      priorConf >= MIN_TRUSTED_MATCH_CONFIDENCE
    ) {
      next.matchConfidence = Math.max(
        next.matchConfidence ?? 0,
        MIN_TRUSTED_MATCH_CONFIDENCE,
      );
    }

    return next;
  };

  return {
    ...results,
    local: results.local.map(patch),
    online: results.online.map(patch),
  };
}
