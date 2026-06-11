import "server-only";

// Pipeline orchestrator: drives one raw_product_records row through
//   RAW → CHECKED → MATCHED → VERIFIED → PUBLISHED   (or a side-state).
//
// Conservative publishing: a record only auto-publishes when it confidently
// matches an existing canonical Product. A high-quality listing with NO catalog
// corroboration goes to NEEDS_REVIEW rather than inventing a new product — a
// smaller, accurate catalog beats a larger, noisy one.

import { prisma } from "../db/prisma";
import { buildNormalizedListing, type RawListingInput } from "./build-listing";
import { checkRequiredFields } from "./validate";
import { matchListings, needsAiAssist } from "./match";
import { scoreMatch } from "./score";
import { classify } from "./state-machine";
import { aiValidateMatch } from "./ai-validate";
import { logValidation } from "./validation-log";
import type { NormalizedListing, ProcessingStatus, ValidationOutcome } from "./types";

interface ProcessOptions {
  /** Allow the AI supplement step for thin/uncertain matches. */
  useAi?: boolean;
}

export interface ProcessResult {
  recordId: string;
  outcome: ValidationOutcome;
  matchedProductId?: string;
}

/** Process a single raw record by id. Returns the final outcome. */
export async function processRawRecord(
  recordId: string,
  opts: ProcessOptions = {},
): Promise<ProcessResult> {
  const record = await prisma.rawProductRecord.findUnique({ where: { id: recordId } });
  if (!record) throw new Error(`raw record ${recordId} not found`);

  const oldStatus = record.processingStatus as ProcessingStatus;
  const listing = buildNormalizedListing(record as unknown as RawListingInput);

  // Stage 1 — required fields / price sanity.
  const fieldCheck = checkRequiredFields(listing);
  if (fieldCheck.hardReject) {
    return finalize(recordId, oldStatus, {
      processingStatus: "REJECTED",
      validationStatus: "rejected",
      confidenceScore: 0,
      reasons: fieldCheck.reasons,
      aiUsed: false,
    });
  }

  // Stage 2 — find the best canonical match among existing products.
  const candidates = await findCandidateProducts(listing);
  let best: { product: CandidateProduct; outcome: ValidationOutcome } | null = null;

  for (const candidate of candidates) {
    const ref = candidateToListing(candidate);
    const match = matchListings(listing, ref);
    const score = scoreMatch(listing, ref);

    let aiUsed = false;
    const structurallyMatched = match.isMatch;
    let finalScore = score.score;
    const reasons = [...match.reasons, ...score.reasons];

    if (!match.isMatch && !score.hardReject && opts.useAi && needsAiAssist(listing, ref)) {
      const ai = await aiValidateMatch(listing, ref);
      aiUsed = true;
      reasons.push(`ai:${ai.same_product} c=${ai.confidence} ${ai.reason}`);
      if (ai.same_product) {
        // AI supplements but never beats structured VERIFIED — cap at review/approved.
        finalScore = Math.max(finalScore, Math.min(ai.confidence, 90));
      }
    }

    const outcome = classify({
      score: finalScore,
      hardReject: score.hardReject,
      categoryKind: listing.categoryKind,
      structurallyMatched,
      reasons,
      aiUsed,
    });

    if (!best || outcome.confidenceScore > best.outcome.confidenceScore) {
      best = { product: candidate, outcome };
    }
  }

  // No catalog corroboration → hold for review, don't invent a product.
  if (!best) {
    return finalize(recordId, oldStatus, {
      processingStatus: "NEEDS_REVIEW",
      validationStatus: "needs_review",
      confidenceScore: scoreMatch(listing).score,
      reasons: ["no_catalog_match"],
      aiUsed: false,
    });
  }

  return finalize(recordId, oldStatus, best.outcome, best.product.id);
}

async function finalize(
  recordId: string,
  oldStatus: ProcessingStatus,
  outcome: ValidationOutcome,
  matchedProductId?: string,
): Promise<ProcessResult> {
  // VERIFIED + approved is the only state that proceeds to PUBLISHED.
  let processingStatus = outcome.processingStatus;
  if (processingStatus === "VERIFIED" && outcome.validationStatus === "approved") {
    processingStatus = "PUBLISHED";
  }

  await prisma.rawProductRecord.update({
    where: { id: recordId },
    data: {
      processingStatus,
      validationStatus: outcome.validationStatus,
      confidenceScore: outcome.confidenceScore,
      validationReasonsJson: JSON.stringify(outcome.reasons),
      matchedProductId: matchedProductId ?? null,
    },
  });

  await logValidation({
    rawProductRecordId: recordId,
    productId: matchedProductId,
    oldStatus,
    newStatus: processingStatus,
    score: outcome.confidenceScore,
    reasons: outcome.reasons,
    aiUsed: outcome.aiUsed,
    aiResult: outcome.aiResult,
  });

  return { recordId, outcome: { ...outcome, processingStatus }, matchedProductId };
}

// ── Candidate lookup ─────────────────────────────────────────────────────────

interface CandidateProduct {
  id: string;
  title: string;
  brand: string;
  upc: string | null;
  gtin: string | null;
  mpn: string | null;
  category: string;
  sizeLabel: string;
  imageUrl: string | null;
  basePriceUsd: number;
}

async function findCandidateProducts(listing: NormalizedListing): Promise<CandidateProduct[]> {
  const codes = [listing.upc, listing.gtin, listing.ean].filter(Boolean) as string[];
  const where: Record<string, unknown>[] = [];
  if (codes.length) {
    where.push({ upc: { in: codes } }, { gtin: { in: codes } });
  }
  if (listing.modelNumber) {
    where.push({ mpn: listing.modelNumber }, { manufacturerPartNumber: listing.modelNumber });
  }
  if (listing.brandNormalized) {
    where.push({ brandCanonical: listing.brandNormalized });
  }
  if (!where.length) return [];

  const rows = await prisma.product.findMany({
    where: { OR: where },
    take: 25,
    select: {
      id: true,
      title: true,
      brand: true,
      upc: true,
      gtin: true,
      mpn: true,
      category: true,
      sizeLabel: true,
      imageUrl: true,
      basePriceUsd: true,
    },
  });
  return rows;
}

function candidateToListing(p: CandidateProduct): NormalizedListing {
  return buildNormalizedListing({
    retailer: "catalog",
    title: p.title,
    brand: p.brand,
    upcGtin: p.upc,
    gtin: p.gtin,
    modelNumber: p.mpn,
    size: p.sizeLabel,
    imageUrl: p.imageUrl,
    price: p.basePriceUsd,
    category: p.category,
  });
}
