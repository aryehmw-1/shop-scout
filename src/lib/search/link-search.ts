import type { LinkIngestResult } from "../matching/link-ingest";
import { compareProduct, createSyntheticCatalogItem, searchSimilarFromLink } from "../retailers/catalog";
import type { CatalogItem } from "../retailers/catalog";
import { enrichOffersAtSearch } from "../offers/enrich-offers-at-search";
import { finalizeResultsForUser } from "../pricing/deal-intelligence";
import { finalizeSearchPrices } from "./price-truth";
import { attachMatchedProduct } from "./matched-product";
import { MIN_CONSUMER_MATCH_CONFIDENCE } from "../offers/consumer-trust";
import { mergeLivePrices } from "./merge-live-prices";
import {
  loadPersistedLiveQuotes,
  resolveVerifiedInventoryByAsin,
} from "../inventory/verified-inventory-resolver";
import { extractAsinFromAmazonUrl } from "./link-persisted-lookup";
import type { ProductSearchResults, ReferenceProduct, ShoppingIntent, VerifiedInventoryHitMeta } from "../types";

function buildReferenceProduct(ingest: LinkIngestResult): ReferenceProduct {
  return {
    title: ingest.guessedTitle,
    sourceUrl: ingest.sourceUrl,
    sourceRetailer: ingest.sourceRetailer,
    referencePrice: ingest.referencePrice,
    imageUrl: ingest.imageUrl,
    priceVerified: ingest.priceVerified,
    priceFromPersistedCache: ingest.priceFromPersistedCache,
    normalizationNote: ingest.normalizationNote,
    matchTier: ingest.matchTier,
    matchConfidence: ingest.matchConfidence,
    equivalenceReasons: ingest.equivalenceReasons,
    variantWarning: ingest.variantWarning,
    pdpFetchOk: ingest.pdpFetchOk,
  };
}

function catalogItemForIngest(ingest: LinkIngestResult): CatalogItem {
  if (ingest.catalogItem) return ingest.catalogItem;
  return createSyntheticCatalogItem(
    ingest.guessedTitle,
    ingest.category,
    ingest.referencePrice,
  );
}

/** Build search results from ingested link — exact compare when confidence allows. */
export async function buildLinkSearchResults(
  ingest: LinkIngestResult,
  intent: ShoppingIntent,
): Promise<ProductSearchResults> {
  const referenceProduct = buildReferenceProduct(ingest);
  const linkMatch = {
    matchTier: ingest.matchTier,
    matchConfidence: ingest.matchConfidence,
    equivalenceReasons: ingest.equivalenceReasons,
    variantWarning: ingest.variantWarning,
    useExactCompare: ingest.useExactCompare,
    pdpFetchOk: ingest.pdpFetchOk,
    ingestLatencyMs: ingest.ingestLatencyMs,
  };

  let verifiedHit: VerifiedInventoryHitMeta | undefined;
  let persistedQuotes = ingest.catalogItem ?
    await loadPersistedLiveQuotes(ingest.catalogItem.id)
  : [];

  const asin = extractAsinFromAmazonUrl(ingest.sourceUrl);
  if (asin && persistedQuotes.length === 0) {
    const verified = await resolveVerifiedInventoryByAsin(asin);
    if (verified.hit && verified.catalogItem) {
      persistedQuotes = verified.quotes;
      verifiedHit = {
        matched: true,
        catalogId: verified.catalogItem.id,
        matchMethod: verified.matchMethod,
        matchScore: verified.matchScore,
        lastVerifiedAt: verified.lastVerifiedAt,
        confidence: verified.resolved?.confidence,
        normalizationStatus: verified.normalizationNote,
        qaStatus: verified.qaStatus,
        candidateCount: verified.candidates.length,
        candidates: verified.candidates.map((c) => ({
          catalogId: c.catalogId,
          title: c.title,
          score: c.score,
          hasPersistedQuotes: c.hasPersistedQuotes,
          rejectedReason: c.rejectedReason,
        })),
      };
    }
  }

  let results: ProductSearchResults;

  const item = catalogItemForIngest(ingest);

  if ((ingest.useExactCompare && ingest.catalogItem) || persistedQuotes.length > 0) {
    const catalogItem = ingest.catalogItem ?? item;
    results = compareProduct(catalogItem, intent);
    results = {
      ...results,
      compareMode: true,
      similarMode: false,
      referenceProduct,
      linkMatch,
      verifiedInventoryHit: verifiedHit,
    };
    results = attachMatchedProduct(results, catalogItem, ingest.guessedTitle);

    if (persistedQuotes.length > 0) {
      const merged = mergeLivePrices(
        results,
        persistedQuotes,
        catalogItem,
        intent,
        "scraped",
        { skipRelevanceFilter: true },
      );
      results = {
        ...attachMatchedProduct(merged.results, catalogItem, ingest.guessedTitle),
        verifiedInventoryHit: verifiedHit ?? results.verifiedInventoryHit,
      };
    }

    // When only persisted inventory exists, show verified offers — do not strip reference-priced rows.
    if (ingest.priceFromPersistedCache && results.online.length === 0 && persistedQuotes.length > 0) {
      const merged = mergeLivePrices(
        { ...results, online: [], local: [] },
        persistedQuotes,
        catalogItem,
        intent,
        "scraped",
        { skipRelevanceFilter: true },
      );
      results = attachMatchedProduct(merged.results, catalogItem, ingest.guessedTitle);
    } else if (ingest.priceVerified && ingest.referencePrice > 0 && !ingest.priceFromPersistedCache) {
      results = {
        ...results,
        online: results.online.filter(
          (o) =>
            o.landedCost < ingest.referencePrice &&
            o.productUrl !== ingest.sourceUrl,
        ),
      };
    }
  } else {
    results = searchSimilarFromLink(
      {
        guessedTitle: ingest.guessedTitle,
        category: ingest.category,
        referencePrice: ingest.referencePrice,
        sourceUrl: ingest.sourceUrl,
        sourceRetailer: ingest.sourceRetailer,
        catalogId: ingest.catalogId,
      },
      intent,
    );
    results = {
      ...results,
      referenceProduct: {
        ...referenceProduct,
        ...(results.referenceProduct ?? {}),
      },
      linkMatch,
    };
  }

  results = await enrichOffersAtSearch(results, item, intent);
  results = finalizeSearchPrices(results);

  if (ingest.variantWarning) {
    results = {
      ...results,
      online: results.online.map((o) => ({
        ...o,
        isBestDeal: false,
        dealLabel: undefined,
      })),
    };
  }

  if (!ingest.useExactCompare && persistedQuotes.length === 0) {
    results = {
      ...results,
      online: results.online.filter(
        (o) => (o.matchConfidence ?? 0) >= MIN_CONSUMER_MATCH_CONFIDENCE,
      ),
      similarMode: true,
    };
  }

  results = await finalizeResultsForUser(results, item, intent);
  return {
    ...results,
    verifiedInventoryHit: verifiedHit ?? results.verifiedInventoryHit,
  };
}
