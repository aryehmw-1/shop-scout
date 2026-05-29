/**
 * Human-in-the-loop inventory QA for persisted verified quotes.
 */

import { prisma } from "../db/prisma";
import { CATALOG } from "../retailers/catalog";
import { extractAmazonAsin } from "../offers/amazon-validation";
import {
  analyzeQuantityExpectation,
  type QuantityExpectationAnalysis,
} from "../offers/quantity-expectation";
import { getFlagshipCatalogIds } from "./flagship-catalog";

const VERIFIED_SOURCES = ["scraped", "connector_api", "daily_index", "nightly_index"];

export type QaReviewStatus = "pending" | "approved" | "rejected";
export type QaReviewTag =
  | "suspicious_quantity"
  | "wrong_product_identity"
  | "bulk_mismatch";

export interface QaCandidate {
  priceQuoteId: string;
  catalogId: string;
  canonicalTitle: string;
  canonicalBrand: string;
  category: string;
  catalogBasePrice: number;
  catalogSize: string;
  catalogImageUrl?: string;
  retailerId: string;
  storeTitle: string | null;
  imageUrl: string | null;
  priceUsd: number;
  unitPriceUsd: number;
  matchConfidence: number;
  productUrl: string;
  asin?: string;
  source: string;
  fetchedAt: string;
  expiresAt: string;
  quantity: QuantityExpectationAnalysis;
  reviewStatus: QaReviewStatus;
  reviewTags: QaReviewTag[];
  reviewNotes?: string;
  reviewedAt?: string;
}

export interface QaWorkflowSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  misleadingQuantity: number;
}

export async function loadQaCandidates(options: {
  flagshipOnly?: boolean;
  status?: QaReviewStatus | "all";
} = {}): Promise<{ candidates: QaCandidate[]; summary: QaWorkflowSummary }> {
  const now = new Date();
  const flagshipSet = new Set(getFlagshipCatalogIds());

  const rows = await prisma.priceQuote.findMany({
    where: {
      source: { in: VERIFIED_SOURCES },
      expiresAt: { gt: now },
    },
    include: {
      product: true,
      qaReview: true,
    },
    orderBy: [{ product: { category: "asc" } }, { priceUsd: "asc" }],
  });

  const candidates: QaCandidate[] = [];

  for (const row of rows) {
    const catalogId = row.product.catalogId;
    if (options.flagshipOnly && !flagshipSet.has(catalogId)) continue;

    const catalog = CATALOG.find((c) => c.id === catalogId);
    const storeTitle = row.storeTitle ?? row.product.title;
    const item =
      catalog ?? {
        id: catalogId,
        title: row.product.title,
        brand: row.product.brand,
        size: row.product.sizeLabel,
        upc: row.product.upc ?? "",
        imageUrl: row.product.imageUrl ?? "",
        category: row.product.category,
        keywords: [],
        organic: row.product.organic,
        basePrice: row.product.basePriceUsd,
        unitLabel: row.product.unitLabel,
        slug: row.product.slug,
      };

    const quantity = analyzeQuantityExpectation(item, storeTitle, row.priceUsd);
    const reviewStatus = (row.qaReview?.status ?? "pending") as QaReviewStatus;
    const reviewTags = JSON.parse(row.qaReview?.tagsJson ?? "[]") as QaReviewTag[];

    if (options.status && options.status !== "all" && reviewStatus !== options.status) {
      continue;
    }

    candidates.push({
      priceQuoteId: row.id,
      catalogId,
      canonicalTitle: row.product.title,
      canonicalBrand: row.product.brand,
      category: row.product.category,
      catalogBasePrice: row.product.basePriceUsd,
      catalogSize: row.product.sizeLabel,
      catalogImageUrl: row.product.imageUrl ?? catalog?.imageUrl,
      retailerId: row.retailerId,
      storeTitle: row.storeTitle,
      imageUrl: row.imageUrl,
      priceUsd: row.priceUsd,
      unitPriceUsd: row.unitPriceUsd,
      matchConfidence: row.matchConfidence,
      productUrl: row.productUrl,
      asin: extractAmazonAsin(row.productUrl),
      source: row.source,
      fetchedAt: row.fetchedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      quantity,
      reviewStatus,
      reviewTags,
      reviewNotes: row.qaReview?.notes ?? undefined,
      reviewedAt: row.qaReview?.reviewedAt?.toISOString(),
    });
  }

  const summary: QaWorkflowSummary = {
    total: candidates.length,
    pending: candidates.filter((c) => c.reviewStatus === "pending").length,
    approved: candidates.filter((c) => c.reviewStatus === "approved").length,
    rejected: candidates.filter((c) => c.reviewStatus === "rejected").length,
    misleadingQuantity: candidates.filter((c) => c.quantity.wouldMisleadConsumer).length,
  };

  return { candidates, summary };
}

export async function submitQaReview(input: {
  priceQuoteId: string;
  catalogId: string;
  status: QaReviewStatus;
  tags?: QaReviewTag[];
  notes?: string;
}): Promise<void> {
  await prisma.inventoryQaReview.upsert({
    where: { priceQuoteId: input.priceQuoteId },
    create: {
      priceQuoteId: input.priceQuoteId,
      catalogId: input.catalogId,
      status: input.status,
      tagsJson: JSON.stringify(input.tags ?? []),
      notes: input.notes,
      reviewedAt: new Date(),
    },
    update: {
      status: input.status,
      tagsJson: JSON.stringify(input.tags ?? []),
      notes: input.notes,
      reviewedAt: new Date(),
    },
  });
}

export async function getApprovedCatalogIds(): Promise<string[]> {
  const rows = await prisma.inventoryQaReview.findMany({
    where: { status: "approved" },
    select: { catalogId: true },
    distinct: ["catalogId"],
  });
  return rows.map((r) => r.catalogId);
}
