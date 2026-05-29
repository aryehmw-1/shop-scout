import type { LinkIngestResult } from "../matching/link-ingest";
import { compareProduct, createSyntheticCatalogItem, searchSimilarFromLink } from "../retailers/catalog";
import type { CatalogItem } from "../retailers/catalog";
import { enrichOffersAtSearch } from "../offers/enrich-offers-at-search";
import { finalizeResultsForUser } from "../pricing/deal-intelligence";
import { finalizeSearchPrices } from "./price-truth";
import { attachMatchedProduct } from "./matched-product";
import { MIN_CONSUMER_MATCH_CONFIDENCE } from "../offers/consumer-trust";
import type { ProductSearchResults, ReferenceProduct, ShoppingIntent } from "../types";

function buildReferenceProduct(ingest: LinkIngestResult): ReferenceProduct {
  return {
    title: ingest.guessedTitle,
    sourceUrl: ingest.sourceUrl,
    sourceRetailer: ingest.sourceRetailer,
    referencePrice: ingest.referencePrice,
    imageUrl: ingest.imageUrl,
    priceVerified: ingest.priceVerified,
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

  let results: ProductSearchResults;

  if (ingest.useExactCompare && ingest.catalogItem) {
    results = compareProduct(ingest.catalogItem, intent);
    results = {
      ...results,
      compareMode: true,
      similarMode: false,
      referenceProduct,
      linkMatch,
    };
    results = attachMatchedProduct(results, ingest.catalogItem, ingest.guessedTitle);

    // Flagship link compare: only show verified alternatives cheaper than pasted reference price.
    if (ingest.priceVerified && ingest.referencePrice > 0) {
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

  const item = catalogItemForIngest(ingest);
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

  // Link flagship: only show verified alternatives that pass consumer trust gates.
  // Suppress low-confidence cross-retailer matches from similar-mode fallback.
  if (!ingest.useExactCompare) {
    results = {
      ...results,
      online: results.online.filter(
        (o) => (o.matchConfidence ?? 0) >= MIN_CONSUMER_MATCH_CONFIDENCE,
      ),
      similarMode: true,
    };
  }

  results = await finalizeResultsForUser(results, item, intent);
  return results;
}
