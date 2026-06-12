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
} from "./canonical-identity";
import type { NormalizedListing } from "./types";

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
      mpn: listing.modelNumber ?? null,
      category: listing.category ?? "general",
      sizeLabel: listing.sizeNormalized ?? listing.size ?? "1 unit",
      basePriceUsd: listing.price ?? 0,
      imageUrl: listing.imageUrl ?? null,
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
  if (listing.modelNumber) identifiers.push({ type: "mpn", value: listing.modelNumber });
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
