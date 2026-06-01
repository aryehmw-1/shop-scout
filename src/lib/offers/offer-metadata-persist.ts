import { upsertProductIdentifiers, upsertRetailerProductIdentity } from "../db/identity-store";
import { indexLog } from "../indexing/index-progress";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, RetailerId } from "../types";
import { extractAmazonAsin } from "./amazon-validation";
import type { RetailerEnrichmentAttempt } from "./enrichment-report";
import type { RetailerPageExtraction } from "./retailer-page-extract";
import { isPdpProductUrl } from "./url-classifier";

export interface PartialMetadataPersistReport {
  identitiesStored: number;
  asinsLinked: number;
  retailers: RetailerId[];
}

/**
 * Persist PDP URL / image / ASIN metadata when price verification failed.
 * Does not write PriceQuote rows — identity store only.
 */
export async function persistPartialEnrichmentMetadata(input: {
  productDbId: string;
  item: CatalogItem;
  offer: ProductOffer;
  extraction?: RetailerPageExtraction | null;
  attempt?: RetailerEnrichmentAttempt;
}): Promise<boolean> {
  const { productDbId, item, offer, extraction, attempt } = input;
  const pdpUrl =
    extraction?.canonicalPdpUrl && isPdpProductUrl(extraction.canonicalPdpUrl) ?
      extraction.canonicalPdpUrl
    : isPdpProductUrl(offer.productUrl) ? offer.productUrl
    : attempt?.pdpUrl && isPdpProductUrl(attempt.pdpUrl) ? attempt.pdpUrl
    : undefined;

  const imageUrl =
    extraction?.imageUrl ??
    (attempt?.hasImage ? offer.imageUrl : undefined);
  const storeTitle =
    extraction?.storeTitle ?? offer.storeTitle ?? offer.title;

  if (!pdpUrl && !imageUrl && !storeTitle) return false;

  const identifiers = { ...extraction?.identifiers };
  if (offer.retailer === "amazon") {
    const asin = extractAmazonAsin(pdpUrl ?? offer.productUrl);
    if (asin) identifiers.asin = asin;
  }

  try {
    await upsertRetailerProductIdentity({
      retailerId: offer.retailer,
      storeTitle,
      productUrl: pdpUrl ?? offer.productUrl,
      retailerBrandRaw: offer.brand,
      identifiers,
      productId: productDbId,
      rawAttributesJson: JSON.stringify({
        partialMetadata: true,
        hasImage: Boolean(imageUrl),
        hasPrice: Boolean(attempt?.price ?? extraction?.priceUsd),
        failureClass: attempt?.failureClass,
        extractedAt: new Date().toISOString(),
      }),
    });

    if (identifiers.asin) {
      await upsertProductIdentifiers(productDbId, { asin: identifiers.asin }, "amazon_paapi");
    }

    indexLog("metadata: partial persist", {
      catalogId: item.id,
      retailer: offer.retailer,
      pdp: pdpUrl?.slice(0, 72),
      hasImage: Boolean(imageUrl),
      asin: identifiers.asin,
    });
    return true;
  } catch {
    return false;
  }
}

export async function persistPartialMetadataBatch(input: {
  productDbId: string;
  item: CatalogItem;
  offers: ProductOffer[];
  attempts: RetailerEnrichmentAttempt[];
  extractions: Map<RetailerId, RetailerPageExtraction | null>;
}): Promise<PartialMetadataPersistReport> {
  const report: PartialMetadataPersistReport = {
    identitiesStored: 0,
    asinsLinked: 0,
    retailers: [],
  };

  const attemptByRetailer = new Map(input.attempts.map((a) => [a.retailer, a]));

  for (const offer of input.offers) {
    const attempt = attemptByRetailer.get(offer.retailer);
    if (!attempt?.failureClass) continue;
    if (
      attempt.failureClass !== "partial_success" &&
      attempt.failureClass !== "no_price_extracted"
    ) {
      continue;
    }

    const extraction = input.extractions.get(offer.retailer);
    const ok = await persistPartialEnrichmentMetadata({
      productDbId: input.productDbId,
      item: input.item,
      offer,
      extraction,
      attempt,
    });
    if (!ok) continue;

    report.identitiesStored += 1;
    report.retailers.push(offer.retailer);
    const asin = extractAmazonAsin(
      extraction?.canonicalPdpUrl ?? offer.productUrl,
    );
    if (asin) report.asinsLinked += 1;
  }

  return report;
}

export async function persistAmazonPaapiIdentity(input: {
  productDbId: string;
  item: CatalogItem;
  offer: ProductOffer;
}): Promise<boolean> {
  if (input.offer.retailer !== "amazon") return false;
  if (input.offer.priceSource !== "connector_api") return false;
  if (!isPdpProductUrl(input.offer.productUrl)) return false;

  const asin = extractAmazonAsin(input.offer.productUrl);
  if (!asin) return false;

  try {
    await upsertRetailerProductIdentity({
      retailerId: "amazon",
      storeTitle: input.offer.storeTitle ?? input.offer.title,
      productUrl: input.offer.productUrl,
      retailerBrandRaw: input.offer.brand,
      identifiers: { asin },
      productId: input.productDbId,
      rawAttributesJson: JSON.stringify({
        source: "amazon_paapi",
        priceSource: input.offer.priceSource,
        linkedAt: new Date().toISOString(),
      }),
    });
    await upsertProductIdentifiers(input.productDbId, { asin }, "amazon_paapi");
    return true;
  } catch {
    return false;
  }
}
