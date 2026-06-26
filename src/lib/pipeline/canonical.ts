import "server-only";

// Canonical product creation + cross-retailer duplicate grouping.
//
// Two responsibilities:
//   1. duplicateGroupKey / assignDuplicateGroups — deterministic, pure grouping
//      so the SAME product from multiple retailers lands in one group.
//   2. createCanonicalProduct — SAFELY mint a new canonical Product from a
//      high-confidence, strongly-identified verified raw record. Uncertain or
//      weakly-identified records must go to NEEDS_REVIEW instead (the caller in
//      pipeline.ts enforces this via isCanonicalCreationSafe).

import { prisma } from "../db/prisma";
import { logValidation } from "./validation-log";
import {
  duplicateGroupKey,
  slugForProduct as slug,
  shortHash,
  searchKeywords,
} from "./canonical-identity";
import type { NormalizedListing } from "./types";
import { buildTrackedAffiliateUrl } from "../affiliate/integration";
import type { RetailerId } from "../types";

// Re-export the pure identity helpers so existing importers keep working.
export {
  duplicateGroupKey,
  assignDuplicateGroups,
  isCanonicalCreationSafe,
  CANONICAL_CREATE_MIN_SCORE,
} from "./canonical-identity";

/**
 * Create a canonical Product from a high-confidence verified raw record and link
 * the record to it. The new product is published + approved (it only reaches
 * here when the caller confirmed isCanonicalCreationSafe). Idempotent on
 * duplicateGroupKey: if a product with this identity already exists, links to it
 * instead of creating a duplicate.
 */
export async function createCanonicalProduct(
  recordId: string,
  listing: NormalizedListing,
): Promise<{ productId: string; created: boolean }> {
  const groupKey = duplicateGroupKey(listing);

  // Idempotency: if a product already carries this identity, reuse it.
  if (groupKey) {
    const existing = await prisma.product.findFirst({
      where: { duplicateGroupId: groupKey },
      select: { id: true },
    });
    if (existing) {
      await prisma.rawProductRecord.update({
        where: { id: recordId },
        data: {
          matchedProductId: existing.id,
          duplicateGroupId: groupKey,
          processingStatus: "PUBLISHED",
          validationStatus: "approved",
        },
      });
      return { productId: existing.id, created: false };
    }
  }

  const base = `${listing.brand ?? ""} ${listing.title}`.trim();
  const suffix = shortHash(groupKey ?? `${recordId}:${base}`);
  const catalogId = `cat-${slug(base) || "product"}-${suffix}`;
  const productSlug = `${slug(base) || "product"}-${suffix}`;

  const product = await prisma.product.create({
    data: {
      catalogId,
      slug: productSlug,
      title: listing.title,
      brand: listing.brand ?? "Unknown",
      brandCanonical: listing.brandNormalized,
      upc: listing.upc ?? null,
      gtin: listing.gtin ?? null,
      // Only store a REAL manufacturer part number in mpn — never a retailer SKU
      // (ASIN/item-id), which would pollute the cross-retailer model identity.
      mpn: listing.modelNumberNormalized ?? null,
      category: listing.category ?? "general",
      sizeLabel: listing.sizeNormalized ?? listing.size ?? "1 unit",
      basePriceUsd: listing.price ?? 0,
      imageUrl: listing.imageUrl ?? null,
      // ASCII-folded title/brand tokens so diacritic-heavy names (IKEA's BESTÅ,
      // TÄRNABY, …) are matchable by plain-text chat queries ("besta", "tarnaby").
      keywordsJson: JSON.stringify(searchKeywords(listing.title, listing.brand)),
      duplicateGroupId: groupKey,
      // Provenance: minted by the verification pipeline, already approved.
      processingStatus: "PUBLISHED",
      validationStatus: "approved",
      published: true,
      confidenceScore: 100,
      lastVerifiedAt: new Date(),
    },
    select: { id: true },
  });

  // Attach the authoritative identifiers we have.
  const identifiers: { type: string; value: string }[] = [];
  if (listing.upc) identifiers.push({ type: "upc", value: listing.upc });
  if (listing.gtin) identifiers.push({ type: "gtin", value: listing.gtin });
  // Real manufacturer model → mpn identifier; retailer SKU → its own type so it's
  // preserved (catalog identity / refresh) without polluting cross-retailer mpn.
  if (listing.modelNumberNormalized) identifiers.push({ type: "mpn", value: listing.modelNumberNormalized });
  if (listing.retailerSku) identifiers.push({ type: "retailer_sku", value: listing.retailerSku });
  for (const id of identifiers) {
    await prisma.productIdentifier
      .create({
        data: { productId: product.id, type: id.type, value: id.value, source: "pipeline" },
      })
      .catch(() => {
        /* identifier may already exist (unique type+value) — ignore */
      });
  }

  await prisma.rawProductRecord.update({
    where: { id: recordId },
    data: {
      matchedProductId: product.id,
      duplicateGroupId: groupKey,
      processingStatus: "PUBLISHED",
      validationStatus: "approved",
      confidenceScore: 100,
    },
  });

  await logValidation({
    rawProductRecordId: recordId,
    productId: product.id,
    oldStatus: "VERIFIED",
    newStatus: "PUBLISHED",
    score: 100,
    reasons: ["canonical_created"],
    aiUsed: false,
  });

  return { productId: product.id, created: true };
}

// ── Trusted first-party catalog publishing (e.g. IKEA) ───────────────────────

interface TrustedRecordInput {
  id: string;
  productUrl: string | null;
  imageUrl: string | null;
  price: number | null;
  retailerId: string;
}

/**
 * Attach the retailer's OWN listing (price + product URL) to a canonical product
 * as a PriceQuote so the product surfaces in search/inventory immediately. Used
 * by BOTH the trusted-catalog publish (IKEA) and the conservative non-trusted
 * publish path (Amazon/Walmart/Target via createCanonicalProduct) — search only
 * returns products that carry at least one live offer, so a published product
 * without an offer would be invisible. Idempotent on product+retailer+url.
 *
 * The affiliate URL is built through the central affiliate builder, which falls
 * back to the plain product URL when a retailer has no affiliate program/creds.
 */
export async function attachRetailerOffer(
  record: TrustedRecordInput,
  listing: NormalizedListing,
  productId: string,
): Promise<boolean> {
  const price = record.price ?? listing.price;
  const url = record.productUrl ?? listing.productUrl;
  if (!price || price <= 0 || !url) return false;

  // Idempotent: one offer per product+retailer+url.
  const existing = await prisma.priceQuote.findFirst({
    where: { productId, retailerId: record.retailerId, productUrl: url },
    select: { id: true },
  });
  if (existing) return false;

  const now = new Date();
  await prisma.priceQuote.create({
    data: {
      productId,
      retailerId: record.retailerId,
      channel: "online",
      storeTitle: listing.title,
      imageUrl: record.imageUrl ?? listing.imageUrl ?? null,
      priceUsd: price,
      landedCostUsd: price,
      unitPriceUsd: price,
      inStock: listing.availability !== "out_of_stock",
      // "scraped" keeps it within the consumer-visible VERIFIED_SOURCES set.
      source: "scraped",
      providerSource: "bright_data",
      sourceLabel: record.retailerId,
      productUrl: url,
      // Central affiliate builder: tracked link when a program is configured,
      // otherwise the plain product page URL.
      affiliateUrl: buildTrackedAffiliateUrl(record.retailerId as RetailerId, url),
      matchConfidence: 0.95,
      validationStatus: "approved",
      confidenceScore: 95,
      lastVerifiedAt: now,
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + 14 * 24 * 3600_000),
    },
  });

  return true;
}

/**
 * Publish a verified raw record from a TRUSTED first-party catalog source
 * (e.g. IKEA): create/link its OWN canonical Product and attach a price offer so
 * it shows in search immediately. It is never auto-merged with other retailers'
 * lookalikes — its duplicateGroupKey is its own identity (barcode/brand+model).
 */
export async function publishTrustedCatalogRecord(
  record: TrustedRecordInput,
  listing: NormalizedListing,
): Promise<{ productId: string; offerCreated: boolean }> {
  const { productId } = await createCanonicalProduct(record.id, listing);
  const offerCreated = await attachRetailerOffer(record, listing, productId);
  return { productId, offerCreated };
}
