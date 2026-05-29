import { getActiveVariantGroup, resolveCatalogRow } from "../catalog/resolve-variant";
import {
  mergeRetailerImage,
  resolveVariantGroupImage,
} from "../catalog/variant-group-images";
import {
  getVariantGroupsForItem,
  type CatalogVariantSize,
} from "../catalog/variant-groups";
import type { CatalogItem } from "../retailers/catalog";
import {
  groupImageStale,
  loadVariantGroup,
  recordRetailerGroupImage,
  upsertVariantGroupImages,
} from "../db/variant-group-store";
import { prisma } from "../db/prisma";
import type { ProductOffer, ProductSearchResults, RetailerId, ShoppingIntent } from "../types";
import { classifyProductUrl } from "../offers/url-classifier";
import { fetchRetailerPageData } from "../offers/retailer-page-extract";
import {
  fetchImageFromRetailerPage,
  isGenericCatalogImage,
  isRetailerHostedImage,
  scoreProductImageUrl,
} from "./retailer-page-image";
import { indexLog } from "./index-progress";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function indexVariantGroupImagesEnabled(): boolean {
  const raw = process.env.INDEX_FETCH_RETAILER_IMAGES?.trim().toLowerCase();
  return raw !== "off" && raw !== "false" && raw !== "0";
}

function maxGroupsToIndexPerProduct(): number {
  const raw = process.env.INDEX_IMAGE_MAX_GROUPS?.trim();
  const n = raw ? parseInt(raw, 10) : 3;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 3;
}

function maxRetailersPerGroup(): number {
  const raw = process.env.INDEX_IMAGE_MAX_RETAILERS_PER_GROUP?.trim();
  const n = raw ? parseInt(raw, 10) : 3;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 8) : 3;
}

function staleDays(): number {
  const raw = process.env.INDEX_IMAGE_STALE_DAYS?.trim();
  const n = raw ? parseInt(raw, 10) : 7;
  return Number.isFinite(n) && n > 0 ? n : 7;
}

function pickGroupsToIndex(
  item: CatalogItem,
  intent: ShoppingIntent,
): ReturnType<typeof getVariantGroupsForItem> {
  const groups = getVariantGroupsForItem(item);
  if (!groups.length) return [];

  const active = getActiveVariantGroup(item, intent);
  const ordered = active ?
    [active, ...groups.filter((g) => g.id !== active.id)]
  : groups;

  return ordered.slice(0, maxGroupsToIndexPerProduct());
}

/** One representative offer per retailer (same search URL for all sizes in a group). */
function representativeOffersByRetailer(
  offers: ProductOffer[],
): Map<RetailerId, ProductOffer> {
  const map = new Map<RetailerId, ProductOffer>();
  for (const o of [...offers].sort((a, b) => a.landedCost - b.landedCost)) {
    if (!map.has(o.retailer)) map.set(o.retailer, o);
  }
  return map;
}

async function ensureGroupImagesInDb(
  productDbId: string,
  group: ReturnType<typeof getVariantGroupsForItem>[0],
  offers: ProductOffer[],
): Promise<{ fetched: number; skipped: number }> {
  let fetched = 0;
  let skipped = 0;

  const stored = await loadVariantGroup(productDbId, group.id);
  const hasCanonical =
    stored?.canonicalImageUrl?.startsWith("https://") &&
    !isGenericCatalogImage(stored.canonicalImageUrl);
  const retailerCount = Object.keys(stored?.retailerImageUrls ?? {}).length;
  const fresh =
    !groupImageStale(stored?.lastVerifiedAt ?? null, staleDays()) &&
    (hasCanonical || retailerCount >= 1);

  if (fresh && retailerCount >= maxRetailersPerGroup()) {
    return { fetched: 0, skipped: 1 };
  }

  const byRetailer = representativeOffersByRetailer(offers);
  let retailerMap = { ...(stored?.retailerImageUrls ?? {}) };

  for (const [retailerId, offer] of byRetailer) {
    if (Object.keys(retailerMap).length >= maxRetailersPerGroup()) break;
    if (retailerMap[retailerId]?.startsWith("https://")) {
      skipped += 1;
      continue;
    }

    const existingOnOffer =
      offer.imageUrl?.startsWith("https://") &&
      isRetailerHostedImage(offer.imageUrl, retailerId) &&
      !isGenericCatalogImage(offer.imageUrl);

    let imageUrl = existingOnOffer ? offer.imageUrl : undefined;
    let confidence = imageUrl ? scoreProductImageUrl(imageUrl) : 0;

    if (!imageUrl || confidence < 0.35) {
      const page = await fetchRetailerPageData(offer.productUrl, retailerId);
      const fetchedUrl =
        page?.imageUrl ??
        (await fetchImageFromRetailerPage(offer.productUrl, retailerId));
      if (page?.canonicalPdpUrl && classifyProductUrl(page.canonicalPdpUrl) === "pdp") {
        offer.productUrl = page.canonicalPdpUrl;
      }
      if (fetchedUrl) {
        imageUrl = fetchedUrl;
        confidence = scoreProductImageUrl(fetchedUrl);
        fetched += 1;
      } else if (classifyProductUrl(offer.productUrl) === "search") {
        if (process.env.INDEX_OFFER_DIAGNOSTICS === "1") {
          console.log(
            `[variant-group-images] image miss ${retailerId}: search URL only`,
          );
        }
      }
      await sleep(220);
    } else {
      skipped += 1;
    }

    if (imageUrl && confidence >= 0.25) {
      retailerMap = mergeRetailerImage(retailerMap, retailerId, imageUrl);
      await recordRetailerGroupImage(productDbId, group, retailerId, imageUrl, {
        imageSource: "retailer_page",
        imageConfidence: confidence,
      });
    }
  }

  if (!hasCanonical) {
    const firstRetailerUrl = Object.values(retailerMap).find((u) =>
      u?.startsWith("https://"),
    );
    const hero =
      firstRetailerUrl ??
      [...byRetailer.values()].find((o) => o.imageUrl?.startsWith("https://"))?.imageUrl;

    if (hero && !isGenericCatalogImage(hero)) {
      await upsertVariantGroupImages(productDbId, group, {
        canonicalImageUrl: hero,
        retailerImageUrls: retailerMap,
        imageSource: "retailer_page",
        imageConfidence: scoreProductImageUrl(hero),
        touchVerified: true,
      });
    }
  }

  return { fetched, skipped };
}

function applyGroupImagesToOffers(
  offers: ProductOffer[],
  group: ReturnType<typeof getVariantGroupsForItem>[0],
  catalogFallback: string,
  sizeOverride?: CatalogVariantSize | null,
): void {
  for (const offer of offers) {
    const resolved = resolveVariantGroupImage(group, {
      retailerId: offer.retailer,
      size: sizeOverride,
      fallbackCatalogUrl: catalogFallback,
    });
    if (resolved?.url) {
      offer.imageUrl = resolved.url;
      offer.imageSource = resolved.source;
    }
  }
}

export interface VariantGroupImageIndexReport {
  groupsIndexed: number;
  retailerImagesFetched: number;
  cacheHits: number;
}

/**
 * Fetch/store ONE image set per visual variant group (color/style), not per size.
 */
export async function indexVariantGroupImagesForProduct(
  catalogItem: CatalogItem,
  results: ProductSearchResults,
  intent: ShoppingIntent,
): Promise<VariantGroupImageIndexReport> {
  const product = await prisma.product.findUnique({
    where: { catalogId: catalogItem.id },
    select: { id: true },
  });
  if (!product) {
    return { groupsIndexed: 0, retailerImagesFetched: 0, cacheHits: 0 };
  }

  const groups = pickGroupsToIndex(catalogItem, intent);
  if (!groups.length) {
    if (process.env.INDEX_OFFER_DIAGNOSTICS === "1") {
      console.log(
        `[variant-group-images] skip ${catalogItem.id}: no variantGroups in catalog (use enrich-index-offers for flat SKUs)`,
      );
    }
    return { groupsIndexed: 0, retailerImagesFetched: 0, cacheHits: 0 };
  }

  let retailerImagesFetched = 0;
  let cacheHits = 0;

  const { variantGroup, size } = resolveCatalogRow(catalogItem, intent);

  indexLog("variant-groups: start", {
    catalogId: catalogItem.id,
    groups: groups.length,
  });

  for (const group of groups) {
    indexLog("variant-group", { catalogId: catalogItem.id, groupId: group.id });
    const stats = await ensureGroupImagesInDb(product.id, group, results.online);
    retailerImagesFetched += stats.fetched;
    if (stats.skipped > 0 && stats.fetched === 0) cacheHits += 1;

    const stored = await loadVariantGroup(product.id, group.id);
    const mergedGroup = {
      ...group,
      canonicalImageUrl: stored?.canonicalImageUrl ?? group.canonicalImageUrl,
      retailerImageUrls: {
        ...group.retailerImageUrls,
        ...stored?.retailerImageUrls,
      },
    };

    const isActiveGroup = variantGroup?.id === group.id;
    if (isActiveGroup) {
      applyGroupImagesToOffers(
        results.online,
        mergedGroup,
        catalogItem.imageUrl,
        size,
      );
      applyGroupImagesToOffers(results.local, mergedGroup, catalogItem.imageUrl, size);
    }
  }

  return {
    groupsIndexed: groups.length,
    retailerImagesFetched,
    cacheHits,
  };
}
