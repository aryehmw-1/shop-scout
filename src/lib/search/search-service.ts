import {
  compareViaCatalog,
  linkSimilarViaCatalog,
} from "./connectors/catalog-connector";
import { getCachedSearch, setCachedSearch } from "./cache";
import { ensureCatalogSynced } from "../db/catalog-sync";
import {
  attachMeta,
  persistPriceQuotes,
  persistSearchSession,
} from "../db/search-repository";
import { resolvePrimaryProduct } from "./product-resolver";
import { runSearchWithLivePricing } from "./live-pricing";
import { mergeLivePrices } from "./merge-live-prices";
import { attachMatchedProduct } from "./matched-product";
import { enrichSearchResultsWithImages } from "./product-image-lookup";
import { finalizeSearchPrices } from "./price-truth";
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
 * Central search orchestrator: cache → connector → enrich → persist quotes & session.
 * Live retailer APIs plug in as additional PriceConnector implementations.
 */
export class SearchService {
  async search(
    intent: ShoppingIntent,
    options: SearchServiceOptions = {},
  ): Promise<EnrichedSearchResults> {
    const mode = options.mode ?? "search";
    const zip = intent.zipCode ?? "78701";
    const fullIntent = { ...intent, zipCode: zip };
    const started = Date.now();

    if (!options.skipCache) {
      const cached = getCachedSearch(fullIntent, mode);
      if (cached) {
        const { item, resolved } = resolvePrimaryProduct(fullIntent);
        const withMatch = attachMatchedProduct(cached, item, fullIntent.query);
        let enriched = await enrichSearchResultsWithImages(
          withMatch,
          item,
          fullIntent,
        );
        enriched = finalizeSearchPrices(enriched);
        const hasLive = [...enriched.local, ...enriched.online].some((o) =>
          o.priceSource === "connector_api" || o.priceSource === "cached_quote",
        );
        return attachMeta(enriched, {
          resolved,
          durationMs: Date.now() - started,
          cacheHit: true,
          priceSource: hasLive ? "connector_api" : "cached_quote",
          quoteCount: enriched.local.length + enriched.online.length,
        });
      }
    }

    const { item, resolved } = resolvePrimaryProduct(fullIntent);
    const { results: rawResults, priceSource, liveQuoteCount } =
      await runSearchWithLivePricing(fullIntent, item);
    let results = await enrichSearchResultsWithImages(
      rawResults,
      item,
      fullIntent,
    );
    results = finalizeSearchPrices(results);

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
          zipCode: zip,
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
      quoteCount: results.local.length + results.online.length,
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
        const livePriceSource = priceSourceForLiveOrigin(origin) ?? "connector_api";
        const merged = mergeLivePrices(results, quotes, item, intent, livePriceSource);
        results = attachMatchedProduct(merged.results, item, intent.query);
        liveQuoteCount = merged.liveCount;
        if (liveQuoteCount > 0) priceSource = livePriceSource;
      }
    } catch (e) {
      console.error("[SearchService] compare live pricing failed", e);
    }

    results = await enrichSearchResultsWithImages(results, item, intent);
    results = finalizeSearchPrices(results);

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
      quoteCount: results.local.length + results.online.length,
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
    const results = await linkSimilarViaCatalog(parsed, intent);
    const durationMs = Date.now() - started;

    const resolvedProduct = {
      catalogId: parsed.catalogId ?? "link",
      title: parsed.guessedTitle,
      brand: "",
      confidence: 0.8,
      matchReason: "url_parse",
      synthetic: !parsed.catalogId,
    };
    const meta: SearchExecutionMeta = {
      resolved: resolvedProduct,
      durationMs,
      cacheHit: false,
      priceSource: "catalog_model",
      quoteCount: results.local.length + results.online.length,
    };

    if (!options.skipPersist) {
      try {
        meta.sessionId = await persistSearchSession({
          userId: options.userId,
          zipCode: intent.zipCode ?? "78701",
          queryRaw: parsed.guessedTitle,
          intent,
          mode: "link_similar",
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
}

export const searchService = new SearchService();

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
