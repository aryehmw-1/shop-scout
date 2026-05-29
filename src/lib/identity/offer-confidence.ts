import type { CatalogItem } from "../retailers/catalog";
import { getActiveVariantGroup, resolveCatalogRow } from "../catalog/resolve-variant";
import { isSearchProductUrl } from "../offers/url-classifier";
import type { RetailerId, ShoppingIntent } from "../types";
import {
  confidenceReasonsToJson,
  scoreMatchConfidence,
} from "./confidence-engine";
import { pickBestImage, scoreImageQuality } from "./image-quality";
import { canonicalizeBrand } from "./normalize-brand";
import { identifiersFromRecord } from "./product-identifiers";
import type { ConfidenceBreakdown } from "./types";

export interface OfferConfidenceFields {
  matchConfidence: number;
  identityConfidence: number;
  attributeConfidence: number;
  imageConfidence: number;
  confidenceReasonsJson: string;
}

export function scoreOfferConfidence(
  item: CatalogItem,
  intent: ShoppingIntent,
  retailerId: RetailerId,
  observed: {
    storeTitle?: string;
    brand?: string;
    color?: string;
    size?: string;
    upc?: string;
    gtin?: string;
    mpn?: string;
    imageUrl?: string;
    productUrl?: string;
    priceSource?: string;
  },
): OfferConfidenceFields {
  const { item: resolved, size, variantGroup } = resolveCatalogRow(item, intent);
  const activeGroup = variantGroup ?? getActiveVariantGroup(resolved, intent);

  const imageMeta = observed.imageUrl ?
    scoreImageQuality(observed.imageUrl)
  : undefined;

  const breakdown: ConfidenceBreakdown = scoreMatchConfidence({
    product: {
      catalogId: resolved.id,
      title: resolved.title,
      brand: resolved.brand,
      brandCanonical: canonicalizeBrand(resolved.brand),
      category: resolved.category,
      identifiers: identifiersFromRecord({
        upc: resolved.upc,
        gtin: resolved.upc,
      }),
      attributes: {},
    },
    variantGroup: activeGroup ?
      {
        catalogGroupId: activeGroup.id,
        color: activeGroup.color,
        colorNormalized: activeGroup.colorNormalized,
        identifiers: identifiersFromRecord({}),
      }
    : undefined,
    variant: size ?
      {
        catalogVariantId: size.id,
        sizeLabel: size.sizeLabel,
        sizeNormalized: size.sizeNormalized,
        identifiers: identifiersFromRecord({ gtin: size.gtin }),
      }
    : undefined,
    observed: {
      retailerId,
      storeTitle: observed.storeTitle,
      brandRaw: observed.brand ?? resolved.brand,
      colorRaw: observed.color ?? intent.colors?.[0],
      sizeRaw: observed.size ?? intent.size,
      productUrl: observed.productUrl,
      urlIsSearch: observed.productUrl ?
        isSearchProductUrl(observed.productUrl)
      : undefined,
      priceSource: observed.priceSource,
      identifiers: identifiersFromRecord({
        upc: observed.upc ?? resolved.upc,
        gtin: observed.gtin,
        mpn: observed.mpn,
      }),
    },
    imageConfidence: imageMeta?.imageQualityScore ?? 0.55,
  });

  return {
    matchConfidence: breakdown.matchConfidence,
    identityConfidence: breakdown.identityConfidence,
    attributeConfidence: breakdown.attributeConfidence,
    imageConfidence: breakdown.imageConfidence,
    confidenceReasonsJson: confidenceReasonsToJson(breakdown.confidenceReasons),
  };
}

export function bestImageQualityFromUrls(urls: string[]): number {
  const best = pickBestImage(urls);
  return best?.imageQualityScore ?? 0.5;
}
