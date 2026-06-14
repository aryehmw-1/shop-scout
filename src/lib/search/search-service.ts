import {
  compareViaCatalog,
} from "./connectors/catalog-connector";
import { buildLinkSearchResults } from "./link-search";
import type { LinkIngestResult } from "../matching/link-ingest";
import { ingestLinkProduct } from "../matching/link-ingest";
import { getCachedSearch, setCachedSearch } from "./cache";
import { ensureCatalogSynced } from "../db/catalog-sync";
import {
  attachMeta,
  persistPriceQuotes,
  persistSearchSession,
} from "../db/search-repository";
import { resolvePrimaryProduct } from "./product-resolver";
import { runSearchWithLivePricing } from "./live-pricing";
import {
  resolveVerifiedInventoryQuery,
} from "../inventory/verified-inventory-resolver";
import { inventoryService } from "../inventory/inventory-service";
import { mergeLivePrices } from "./merge-live-prices";
import { coversQuery } from "./query-understanding";
import { attachMatchedProduct } from "./matched-product";
import { enrichSearchResultsWithImages } from "./product-image-lookup";
import { recordSnapshotsOnSearch } from "../own-db/config";
import { finalizePricesWithHistory, shouldUseHistoricalModel } from "../pricing/apply-pricing-pipeline";
import { enrichOffersAtSearch } from "../offers/enrich-offers-at-search";
import { finalizeResultsForUser } from "../pricing/deal-intelligence";
import { finalizeSearchPrices } from "./price-truth";
import { resolveCatalogZip, hasUserZip } from "../constants";
import {
  productDataToSearchResults,
  searchProductDataProviders,
} from "../product-data";
import { persistScrapedQuotesForCatalog } from "./persist-scraped-quotes";
import {
  buildGroceryRetrievalDebug,
  logGroceryRetrievalFailure,
  groceryRetrievalDebugEnabled,
} from "./grocery-retrieval-debug";
import { isGroceryQuery, resolveGroceryProduct } from "./grocery-retrieval";
import { buildRetrievalMetaFromGrocery } from "./retrieval-meta";
import {
  searchPipelineDebugEnabled,
  traceSearchPipeline,
} from "./search-pipeline-debug";
import {
  fetchLiveQuotes,
  priceSourceForLiveOrigin,
} from "./fetch-live-quotes";
import { compareProduct, searchCatalog } from "../retailers/catalog";
import type { CatalogItem } from "../retailers/catalog";
import type {
  ProductSearchResults,
  ReferenceProduct,
  ShoppingIntent,
} from "../types";
import type {
  EnrichedSearchResults,
  SearchContext,
  SearchExecutionMeta,
  SearchServiceOptions,
} from "./types";

/**
 * Central search orchestrator:
 *   1. Cache hit → return immediately
 *   2. DB (verified PriceQuotes) → return + skip live fetch
 *   3. Live providers (eBay Browse API, ShopSavvy) → ingest into DB + return
 *   4. Catalog estimates (fallback only — labeled "Estimated" in UI)
 */
export class SearchService {
  /**
   * When the DB has no fresh quotes for this query, call eBay Browse API /
   * ShopSavvy immediately, convert their results to ProductSearchResults,
   * and fire-and-forget an ingest to DB for the next search.
   */
  private async liveProviderFallback(
    intent: ShoppingIntent,
    item: CatalogItem,
    base: ProductSearchResults,
  ): Promise<ProductSearchResults> {
    try {
      const products = await searchProductDataProviders(intent.query || item.title);
      if (!products.length) return base;

      const merged = productDataToSearchResults(products, item, intent, base);
      if (!merged) return base;

      // Relevance guard: only accept live results that genuinely COVER the
      // query's content words (whole-word, units/numbers ignored). Prevents
      // "spring water" → "...Spring Water SCENT hand soap" or "Cheerios" →
      // "Romaine Hearts". See coversQuery for the coverage rules.
      const relevanceQuery = intent.query || item.title;
      const relevantOffers = merged.online.filter((offer) =>
        coversQuery(`${offer.storeTitle ?? ""} ${offer.title} ${offer.brand ?? ""}`, relevanceQuery),
      );

      if (!relevantOffers.length) {
        console.log("[SearchService] live-provider results rejected (no query overlap)", {
          query: intent.query,
          titles: merged.online.slice(0, 3).map((o) => o.storeTitle ?? o.title),
        });
        return base;
      }

      const filtered = { ...merged, online: relevantOffers };

      // Ingest relevant live offers into DB so the next search is a fast DB-first hit.
      const liveOffers = relevantOffers.filter(
        (o) => o.priceSource === "connector_api" || o.priceSource === "scraped",
      );
      if (liveOffers.length && item.id && !item.id.startsWith("syn-")) {
        persistScrapedQuotesForCatalog(item.id, liveOffers, item, intent).catch(
          (e) => console.error("[SearchService] live-provider ingest failed", e),
        );
      }

      return filtered;
    } catch (e) {
      console.error("[SearchService] liveProviderFallback failed", e);
      return base;
    }
  }
  private async addProductDataProviders(
    results: ProductSearchResults,
    item: CatalogItem,
    fullIntent: ShoppingIntent,
  ): Promise<ProductSearchResults> {
    try {
      const products = await searchProductDataProviders(fullIntent.query || item.title);
      const merged = productDataToSearchResults(products, item, fullIntent, results);
      return merged ?? results;
    } catch (e) {
      console.error("[SearchService] product data providers failed", e);
      return results;
    }
  }

  private async finishSearchResults(
    results: ProductSearchResults,
    item: CatalogItem,
    fullIntent: ShoppingIntent,
    options: SearchServiceOptions,
  ): Promise<ProductSearchResults> {
    let out = finalizeSearchPrices(results);

    if (!options.fastOnly) {
      out = await enrichOffersAtSearch(out, item, fullIntent);
      out = finalizeSearchPrices(out);
    } else {
      out = {
        ...out,
        enrichmentPending: true,
        enrichmentCatalogId: item.id,
        resolvedQuery: fullIntent.query,
      };
    }

    out = await finalizeResultsForUser(out, item, fullIntent);

    if (options.fastOnly) {
      out = {
        ...out,
        enrichmentPending: out.online.length === 0 ? true : out.enrichmentPending,
        enrichmentCatalogId: item.id,
      };
    } else {
      out = { ...out, enrichmentPending: false };
    }

    return out;
  }

  /** Background pass: live retailer scrape + deal refresh. */
  async enrichSearch(
    intent: ShoppingIntent,
    catalogId: string,
    options: SearchServiceOptions = {},
  ): Promise<EnrichedSearchResults> {
    const mode = options.mode ?? "search";
    const userZip = intent.zipCode?.trim() ?? "";
    const catalogZip = resolveCatalogZip(userZip);
    const fullIntent = { ...intent, query: intent.query || catalogId, zipCode: catalogZip };
    const started = Date.now();

    const cached = getCachedSearch(fullIntent, mode);
    const { item, resolved } = resolvePrimaryProduct(fullIntent);
    const base =
      cached ??
      attachMatchedProduct(
        (await runSearchWithLivePricing(fullIntent, item)).results,
        item,
        fullIntent.query,
      );

    let results = options.skipImages ?
      base
    : await enrichSearchResultsWithImages(base, item, fullIntent);

    if (shouldUseHistoricalModel(fullIntent, options)) {
      results = await finalizePricesWithHistory(item.id, results, {
        recordSnapshot: !options.skipPersist && recordSnapshotsOnSearch(),
        snapshotSource: "search_enrich",
      });
    }

    results = await enrichOffersAtSearch(results, item, fullIntent);
    results = finalizeSearchPrices(results);
    results = await finalizeResultsForUser(results, item, fullIntent);
    results = { ...results, enrichmentPending: false, enrichmentCatalogId: catalogId };

    if (!options.skipCache) {
      setCachedSearch(fullIntent, mode, results);
    }

    return attachMeta(results, {
      resolved,
      durationMs: Date.now() - started,
      cacheHit: Boolean(cached),
      priceSource: "scraped",
      quoteCount: results.online.length,
    });
  }

  async search(
    intent: ShoppingIntent,
    options: SearchServiceOptions = {},
  ): Promise<EnrichedSearchResults> {
    const mode = options.mode ?? "search";
    const userZip = intent.zipCode?.trim() ?? "";
    const catalogZip = resolveCatalogZip(userZip);
    const fullIntent = { ...intent, zipCode: catalogZip };
    const started = Date.now();

    if (!options.skipCache) {
      const cached = getCachedSearch(fullIntent, mode);
      if (cached) {
        const { item, resolved } = resolvePrimaryProduct(fullIntent);
        const withMatch = attachMatchedProduct(cached, item, fullIntent.query);
        let enriched = options.skipImages ?
          withMatch
        : await enrichSearchResultsWithImages(withMatch, item, fullIntent);
        if (shouldUseHistoricalModel(fullIntent, options)) {
          enriched = await finalizePricesWithHistory(item.id, enriched);
        }
        enriched = finalizeSearchPrices(enriched);
        if (!options.fastOnly) {
          enriched = await enrichOffersAtSearch(enriched, item, fullIntent);
          enriched = finalizeSearchPrices(enriched);
        }
        enriched = await this.addProductDataProviders(enriched, item, fullIntent);
        enriched = await finalizeResultsForUser(enriched, item, fullIntent);
        if (options.fastOnly) {
          enriched = {
            ...enriched,
            enrichmentPending: true,
            enrichmentCatalogId: item.id,
          };
        }
        const hasLive = enriched.online.some((o) =>
          o.priceSource === "connector_api" || o.priceSource === "cached_quote",
        );
        return attachMeta(enriched, {
          resolved,
          durationMs: Date.now() - started,
          cacheHit: true,
          priceSource: hasLive ? "connector_api" : "cached_quote",
          quoteCount: enriched.online.length,
        });
      }
    }

    const dbFirst = await inventoryService.searchProducts(fullIntent.query, { freshOnly: true, limit: 5 });
    const minimumDbFirstOffers = mode === "compare" ? 2 : 1;
    if (dbFirst && dbFirst.online.length >= minimumDbFirstOffers) {
      const { item, resolved } = resolvePrimaryProduct(fullIntent);
      const durationMs = Date.now() - started;
      let sessionId: string | undefined;

      if (!options.skipPersist) {
        try {
          sessionId = await persistSearchSession({
            userId: options.userId,
            zipCode: catalogZip,
            queryRaw: intent.query,
            intent: fullIntent,
            mode,
            results: dbFirst,
            resolved,
            durationMs,
          });
        } catch (e) {
          console.error("[SearchService] db-first session persist failed", e);
        }
      }

      if (!options.skipCache) {
        setCachedSearch(fullIntent, mode, dbFirst);
      }

      return attachMeta(dbFirst, {
        sessionId,
        resolved,
        durationMs,
        cacheHit: false,
        priceSource: "cached_quote",
        quoteCount: dbFirst.online.length,
      });
    }

    // DB had nothing — try live providers (eBay Browse API, ShopSavvy) before
    // falling back to catalog estimates. Results are ingested into DB so the
    // next identical search will be a fast DB-first hit.
    const { item: liveItem, resolved: liveResolved } = resolvePrimaryProduct(fullIntent);
    const liveProviderResults = await this.liveProviderFallback(
      fullIntent,
      liveItem,
      { local: [], online: [], zipCode: fullIntent.zipCode ?? "78701", compareMode: false },
    );
    if (liveProviderResults.online.length > 0) {
      const durationMs = Date.now() - started;
      let finalized = finalizeSearchPrices(liveProviderResults);
      finalized = await finalizeResultsForUser(finalized, liveItem, fullIntent);
      if (!options.skipCache) setCachedSearch(fullIntent, mode, finalized);
      return attachMeta(finalized, {
        resolved: liveResolved,
        durationMs,
        cacheHit: false,
        priceSource: "connector_api",
        quoteCount: finalized.online.length,
      });
    }

    const verifiedResolution = await resolveVerifiedInventoryQuery(fullIntent.query);

    let item: CatalogItem;
    let resolved: import("./types").ResolvedProduct;

    if (verifiedResolution.hit && verifiedResolution.catalogItem && verifiedResolution.resolved) {
      item = verifiedResolution.catalogItem;
      resolved = verifiedResolution.resolved;
    } else if (verifiedResolution.catalogItem && verifiedResolution.resolved) {
      item = verifiedResolution.catalogItem;
      resolved = verifiedResolution.resolved;
    } else {
      ({ item, resolved } = resolvePrimaryProduct(fullIntent));
    }

    const verifiedHitMeta = verifiedResolution.hit ? {
      matched: true,
      catalogId: verifiedResolution.catalogItem?.id,
      matchMethod: verifiedResolution.matchMethod,
      matchScore: verifiedResolution.matchScore,
      lastVerifiedAt: verifiedResolution.lastVerifiedAt,
      confidence: verifiedResolution.resolved?.confidence,
      normalizationStatus: verifiedResolution.normalizationNote,
      qaStatus: verifiedResolution.qaStatus,
      candidateCount: verifiedResolution.candidates.length,
      candidates: verifiedResolution.candidates.map((c) => ({
        catalogId: c.catalogId,
        title: c.title,
        score: c.score,
        hasPersistedQuotes: c.hasPersistedQuotes,
        rejectedReason: c.rejectedReason,
      })),
    } : verifiedResolution.candidates.length > 0 ? {
      matched: false,
      candidateCount: verifiedResolution.candidates.length,
      candidates: verifiedResolution.candidates.map((c) => ({
        catalogId: c.catalogId,
        title: c.title,
        score: c.score,
        hasPersistedQuotes: c.hasPersistedQuotes,
        rejectedReason: c.rejectedReason,
      })),
    } : undefined;

    const { results: rawResults, priceSource, liveQuoteCount, verifiedInventoryHit } =
      await runSearchWithLivePricing(fullIntent, item, {
        persistedQuotes: verifiedResolution.quotes,
        verifiedInventoryHit: verifiedHitMeta,
      });
    let results =
      options.skipImages ?
        rawResults
      : await enrichSearchResultsWithImages(rawResults, item, fullIntent);

    if (shouldUseHistoricalModel(fullIntent, options)) {
      results = await finalizePricesWithHistory(item.id, results, {
        recordSnapshot:
          !options.skipPersist && recordSnapshotsOnSearch(),
        snapshotSource: priceSource === "connector_api" ? "live_api" : "search",
      });
    }

    results = finalizeSearchPrices(results);
    results = await this.finishSearchResults(results, item, fullIntent, options);
    results = await this.addProductDataProviders(results, item, fullIntent);
    results = await finalizeResultsForUser(results, item, fullIntent);

    results = {
      ...results,
      zipCode: hasUserZip(userZip) ? userZip : "",
      needsZipForShipping: !hasUserZip(userZip),
    };

    if (isGroceryQuery(fullIntent.query, fullIntent)) {
      const grocery = resolveGroceryProduct(fullIntent);
      if (grocery) {
        results = {
          ...results,
          retrievalMeta: buildRetrievalMetaFromGrocery(
            fullIntent.query,
            grocery,
            results.closestMatchFallback,
          ),
        };
      }
    }

    if (results.online.length === 0 || results.closestMatchFallback) {
      const groceryDebug = logGroceryRetrievalFailure(fullIntent, [
        ...results.online,
        ...(results.estimatedOnline ?? []),
        ...(results.lowConfidenceOnline ?? []),
      ]);
      if (groceryDebug) {
        results = { ...results, groceryRetrievalDebug: groceryDebug };
      } else if (groceryRetrievalDebugEnabled()) {
        results = {
          ...results,
          groceryRetrievalDebug: buildGroceryRetrievalDebug(fullIntent, results.online),
        };
      }
    }

    if (verifiedInventoryHit || results.verifiedInventoryHit) {
      results = {
        ...results,
        verifiedInventoryHit: verifiedInventoryHit ?? results.verifiedInventoryHit,
      };
    }

    if (searchPipelineDebugEnabled()) {
      const trace = await traceSearchPipeline(fullIntent, {
        afterEnrich: results,
        item,
        verifiedResolution,
      });
      results = { ...results, searchDebug: trace, verifiedInventoryHit: verifiedInventoryHit ?? results.verifiedInventoryHit };
      console.log("[search-pipeline]", formatSearchPipelineLog(trace));
    }

    if (!options.skipCache) {
      setCachedSearch(fullIntent, mode, results);
    }

    const durationMs = Date.now() - started;
    let sessionId: string | undefined;

    if (!options.skipPersist) {
      try {
        await ensureCatalogSynced();
        sessionId = await persistSearchSession({
          userId: options.userId,
          zipCode: catalogZip,
          queryRaw: intent.query,
          intent: fullIntent,
          mode,
          results,
          resolved,
          durationMs,
        });
        if (!resolved.synthetic) {
          await persistPriceQuotes(resolved.catalogId, results);
        }
      } catch (e) {
        console.error("[SearchService] persist failed", e);
      }
    }

    return attachMeta(results, {
      sessionId,
      resolved,
      durationMs,
      cacheHit: false,
      priceSource,
      quoteCount: results.online.length,
      liveQuoteCount,
    });
  }

  async compareProduct(
    item: CatalogItem,
    intent: ShoppingIntent,
    options: SearchContext = {},
  ): Promise<EnrichedSearchResults> {
    const started = Date.now();
    let results = attachMatchedProduct(
      await compareViaCatalog(item, intent),
      item,
      intent.query,
    );
    let priceSource: SearchExecutionMeta["priceSource"] = "catalog_model";
    let liveQuoteCount = 0;

    try {
      const { quotes, origin } = await fetchLiveQuotes(intent, item);
      if (quotes.length > 0) {
        const livePriceSource =
          priceSourceForLiveOrigin(origin, quotes) ?? "connector_api";
        const merged = mergeLivePrices(results, quotes, item, intent, livePriceSource);
        results = attachMatchedProduct(merged.results, item, intent.query);
        liveQuoteCount = merged.liveCount;
        if (liveQuoteCount > 0) priceSource = livePriceSource;
      }
    } catch (e) {
      console.error("[SearchService] compare live pricing failed", e);
    }

    results =
      options.skipImages ?
        results
      : await enrichSearchResultsWithImages(results, item, intent);

    if (shouldUseHistoricalModel(intent, options)) {
      results = await finalizePricesWithHistory(item.id, results, {
        recordSnapshot:
          !options.skipPersist && recordSnapshotsOnSearch(),
        snapshotSource: "compare",
      });
    }

    results = finalizeSearchPrices(results);
    results = await enrichOffersAtSearch(results, item, intent);
    results = finalizeSearchPrices(results);
    results = await this.addProductDataProviders(results, item, intent);
    results = await finalizeResultsForUser(results, item, intent);

    const resolvedProduct = {
      catalogId: item.id,
      title: item.title,
      brand: item.brand,
      confidence: 0.95,
      matchReason: "explicit_compare",
      synthetic: item.id.startsWith("syn-"),
    };
    const durationMs = Date.now() - started;
    const meta: SearchExecutionMeta = {
      resolved: resolvedProduct,
      durationMs,
      cacheHit: false,
      priceSource,
      quoteCount: results.online.length,
      liveQuoteCount,
    };

    if (!options.skipPersist) {
      try {
        meta.sessionId = await persistSearchSession({
          userId: options.userId,
          zipCode: intent.zipCode ?? "78701",
          queryRaw: intent.query,
          intent,
          mode: "compare",
          results,
          resolved: resolvedProduct,
          durationMs,
        });
      } catch (e) {
        console.error("[SearchService] compare persist failed", e);
      }
    }

    return attachMeta(results, meta);
  }

  async searchFromLink(
    parsed: {
      guessedTitle: string;
      category?: string;
      referencePrice: number;
      sourceUrl: string;
      sourceRetailer?: import("../types").RetailerId;
      catalogId?: string;
    },
    intent: ShoppingIntent,
    options: SearchContext = {},
  ): Promise<EnrichedSearchResults & { referenceProduct?: ReferenceProduct }> {
    const started = Date.now();

    const ingest =
      options.linkIngest ??
      (await ingestLinkProduct(parsed.sourceUrl));

    if (!ingest) {
      throw new Error("link_ingest_failed");
    }

    let results = await buildLinkSearchResults(ingest, intent);
    const durationMs = Date.now() - started;

    const item = ingest.catalogItem ?? {
      id: ingest.catalogId ?? `syn-${ingest.guessedTitle}`,
      title: ingest.guessedTitle,
      brand: ingest.brand,
      size: "",
      upc: ingest.identifiers.upc ?? "",
      imageUrl: ingest.imageUrl ?? "",
      category: ingest.category ?? "general",
      keywords: [],
      organic: false,
      basePrice: ingest.referencePrice,
      unitLabel: "each",
      slug: ingest.catalogId ?? "link",
    };

    const resolvedProduct = {
      catalogId: ingest.catalogId ?? "link",
      title: ingest.guessedTitle,
      brand: ingest.brand,
      confidence: ingest.matchConfidence,
      matchReason: ingest.matchTier,
      synthetic: !ingest.catalogId,
    };

    const meta: SearchExecutionMeta = {
      resolved: resolvedProduct,
      durationMs,
      cacheHit: false,
      priceSource: ingest.priceVerified ? "scraped" : "catalog_model",
      quoteCount: results.online.length,
    };

    if (!options.skipPersist) {
      try {
        meta.sessionId = await persistSearchSession({
          userId: options.userId,
          zipCode: intent.zipCode ?? "78701",
          queryRaw: parsed.sourceUrl,
          intent,
          mode: ingest.useExactCompare ? "link_exact" : "link_similar",
          results,
          resolved: resolvedProduct,
          durationMs,
        });
      } catch (e) {
        console.error("[SearchService] link persist failed", e);
      }
    }

    return {
      ...attachMeta(results, meta),
      referenceProduct: results.referenceProduct,
    };
  }

  /** Ingest + search from raw URL (preferred entry for pasted links). */
  async searchFromUrl(
    sourceUrl: string,
    intent: ShoppingIntent,
    options: SearchContext = {},
  ): Promise<EnrichedSearchResults & { referenceProduct?: ReferenceProduct; ingest?: LinkIngestResult }> {
    const ingest = await ingestLinkProduct(sourceUrl);
    if (!ingest) throw new Error("link_ingest_failed");

    const out = await this.searchFromLink(
      {
        guessedTitle: ingest.guessedTitle,
        category: ingest.category,
        referencePrice: ingest.referencePrice,
        sourceUrl,
        sourceRetailer: ingest.sourceRetailer,
        catalogId: ingest.catalogId,
      },
      intent,
      { ...options, linkIngest: ingest },
    );
    return { ...out, ingest };
  }
}

export const searchService = new SearchService();

function formatSearchPipelineLog(
  trace: Awaited<ReturnType<typeof traceSearchPipeline>>,
): string {
  return trace.stages
    .map((s) => `${s.stage}=${s.count}${s.detail ? ` (${s.detail})` : ""}`)
    .join(" → ");
}

/** Back-compat sync entry (used during migration). */
export function searchCatalogViaService(intent: ShoppingIntent): ProductSearchResults {
  return searchCatalog(intent);
}

export function compareProductViaService(
  item: CatalogItem,
  intent: ShoppingIntent,
): ProductSearchResults {
  return compareProduct(item, intent);
}
