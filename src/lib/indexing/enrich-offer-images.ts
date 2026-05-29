import { resolveCatalogRow } from "../catalog/resolve-variant";
import { resolveVariantGroupImage } from "../catalog/variant-group-images";
import { enrichSearchResultsWithImages } from "../search/product-image-lookup";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, ProductSearchResults, ShoppingIntent } from "../types";
import {
  enrichOffersAtIndex,
  indexOfferEnrichmentEnabled,
} from "../offers/enrich-index-offers";
import {
  indexVariantGroupImagesEnabled,
  indexVariantGroupImagesForProduct,
} from "./index-variant-group-images";
import { prisma } from "../db/prisma";
import { indexLog } from "./index-progress";

export { indexVariantGroupImagesEnabled };

export interface EnrichedIndexImagesReport {
  results: ProductSearchResults;
  retailerImagesFetched: number;
  variantGroupsIndexed: number;
  imageCacheHits: number;
  offerEnrichment?: {
    offersEnriched: number;
    pdpUrlsResolved: number;
    imagesFetched: number;
    pricesExtracted: number;
  };
}

/**
 * Nightly image pass:
 * 1. Hero/catalog/Openverse (product-level)
 * 2. Variant-group retailer URLs (one fetch per color/style, not per size)
 */
export async function enrichIndexSearchResults(
  results: ProductSearchResults,
  item: CatalogItem,
  intent: ShoppingIntent,
): Promise<EnrichedIndexImagesReport> {
  indexLog("images: hero/openverse pass", { catalogId: item.id });
  const heroStarted = Date.now();
  let out = await enrichSearchResultsWithImages(results, item, intent);
  indexLog("images: hero/openverse done", {
    catalogId: item.id,
    elapsed: `${Date.now() - heroStarted}ms`,
  });

  let retailerImagesFetched = 0;
  let variantGroupsIndexed = 0;
  let imageCacheHits = 0;
  let offerEnrichment: EnrichedIndexImagesReport["offerEnrichment"];

  const productRow = await prisma.product.findUnique({
    where: { catalogId: item.id },
    select: { id: true },
  });

  const enrichPass = await enrichOffersAtIndex(
    out,
    item,
    intent,
    productRow?.id,
  );
  out = enrichPass.results;
  if (indexOfferEnrichmentEnabled()) {
    retailerImagesFetched += enrichPass.report.imagesFetched;
    offerEnrichment = {
      offersEnriched: enrichPass.report.offersEnriched,
      pdpUrlsResolved: enrichPass.report.pdpUrlsResolved,
      imagesFetched: enrichPass.report.imagesFetched,
      pricesExtracted: enrichPass.report.pricesExtracted,
    };
  }

  if (indexVariantGroupImagesEnabled()) {
    const groupPass = await indexVariantGroupImagesForProduct(item, out, intent);
    retailerImagesFetched = groupPass.retailerImagesFetched;
    variantGroupsIndexed = groupPass.groupsIndexed;
    imageCacheHits = groupPass.cacheHits;
  }

  const { variantGroup, size } = resolveCatalogRow(item, intent);
  if (variantGroup) {
    const patch = (o: ProductOffer) => {
      const resolved = resolveVariantGroupImage(variantGroup, {
        retailerId: o.retailer,
        size: size ?? undefined,
        fallbackCatalogUrl: item.imageUrl,
      });
      if (resolved?.url) {
        o.imageUrl = resolved.url;
        o.imageSource = resolved.source;
      }
    };
    out.online.forEach(patch);
    out.local.forEach(patch);
  }

  return {
    results: out,
    retailerImagesFetched,
    variantGroupsIndexed,
    imageCacheHits,
    offerEnrichment,
  };
}
