/**
 * Inventory health metrics — measurable truth about canonical graph + verified offers.
 * Separates catalog entries from production-usable inventory.
 */

import { prisma } from "../db/prisma";
import { CATALOG } from "../retailers/catalog";
import {
  getFlagshipCatalogIds,
} from "./flagship-catalog";
import { MIN_CONSUMER_MATCH_CONFIDENCE } from "../offers/consumer-trust";
import {
  runOperationalAudit,
  type OperationalAuditReport,
  type ProductGrade,
} from "../audit/operational-audit";

const VERIFIED_SOURCES = ["scraped", "connector_api", "daily_index", "nightly_index"];
const STALE_HOURS = 48;

export interface RetailerIngestionProfile {
  retailerId: string;
  mode: "pdp_enrichment" | "search_enrichment" | "api" | "catalog_estimate_only";
  catalogIngest: boolean;
  searchTriggered: boolean;
  nightlyIndex: boolean;
  userLinkTriggered: boolean;
  notes: string;
}

export interface InventoryHealthReport {
  generatedAt: string;
  /** In-memory curated catalog (source of truth for canonical IDs). */
  inMemoryCatalogSize: number;
  /** Product rows synced to DB. */
  canonicalProductCount: number;
  variantGroupCount: number;
  productIdentifierCount: number;
  /** RetailerProductIdentity = observed retailer PDPs. */
  uniqueRetailerPdps: number;
  linkedRetailerPdps: number;
  totalPriceQuoteRows: number;
  estimateQuoteRows: number;
  verifiedQuoteRows: number;
  activeVerifiedQuotes: number;
  expiredVerifiedQuotes: number;
  staleActiveVerifiedQuotes: number;
  productsWithActiveVerified: number;
  productsWith2PlusRetailers: number;
  productsWith3PlusRetailers: number;
  retailerOverlapPct: number;
  avgRetailersPerActiveProduct: number;
  freshnessPct: number;
  stalePct: number;
  byCategory: CategoryInventoryRow[];
  byRetailerVerified: { retailerId: string; total: number; active: number }[];
  gradeDistribution: Record<ProductGrade, number>;
  productionUsable: number;
  operational: OperationalAuditReport;
  ingestionProfiles: RetailerIngestionProfile[];
  flagship: {
    count: number;
    activeVerified: number;
    productionUsable: number;
    overlap2Plus: number;
  };
  trustMetrics: {
    freshnessFailurePct: number;
    lowConfidencePct: number;
    lowImageConfidencePct: number;
    consumerTrustPassPct: number;
    matchConfidenceBuckets: { bucket: string; count: number; pct: number }[];
  };
}

export interface CategoryInventoryRow {
  category: string;
  canonicalCount: number;
  activeVerified: number;
  expiredVerified: number;
  estimateOnly: number;
  avgRetailers: number;
  overlap2Plus: number;
  productionUsable: number;
}

/** How each core retailer participates in inventory (operational model). */
export function getRetailerIngestionProfiles(): RetailerIngestionProfile[] {
  return [
    {
      retailerId: "amazon",
      mode: "api",
      catalogIngest: false,
      searchTriggered: true,
      nightlyIndex: true,
      userLinkTriggered: true,
      notes: "HTML adapter + PA-API fallback; best current reliability",
    },
    {
      retailerId: "walmart",
      mode: "pdp_enrichment",
      catalogIngest: false,
      searchTriggered: true,
      nightlyIndex: true,
      userLinkTriggered: true,
      notes: "PDP adapter; requires residential proxy for production scale",
    },
    {
      retailerId: "target",
      mode: "pdp_enrichment",
      catalogIngest: false,
      searchTriggered: true,
      nightlyIndex: true,
      userLinkTriggered: true,
      notes: "PDP adapter; anti-bot heavy — queue + proxy required",
    },
    {
      retailerId: "costco",
      mode: "pdp_enrichment",
      catalogIngest: false,
      searchTriggered: true,
      nightlyIndex: true,
      userLinkTriggered: true,
      notes: "Limited adapter; hybrid API preferred long-term",
    },
    {
      retailerId: "kroger",
      mode: "pdp_enrichment",
      catalogIngest: false,
      searchTriggered: true,
      nightlyIndex: true,
      userLinkTriggered: true,
      notes: "Regional; proxy + structured extraction",
    },
    {
      retailerId: "* (non-core)",
      mode: "catalog_estimate_only",
      catalogIngest: false,
      searchTriggered: false,
      nightlyIndex: false,
      userLinkTriggered: false,
      notes: "Listing multipliers only — not verified enrichment when INDEX_CORE_RETAILERS_ONLY=on",
    },
  ];
}

export async function computeInventoryHealth(): Promise<InventoryHealthReport> {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_HOURS * 60 * 60 * 1000);
  const operational = await runOperationalAudit();

  const [
    canonicalProductCount,
    variantGroupCount,
    productIdentifierCount,
    uniqueRetailerPdps,
    linkedRetailerPdps,
    totalPriceQuoteRows,
    estimateQuoteRows,
    verifiedQuoteRows,
    activeVerifiedQuotes,
    expiredVerifiedQuotes,
    staleActiveVerifiedQuotes,
    activeQuotes,
    identities,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.variantGroup.count(),
    prisma.productIdentifier.count(),
    prisma.retailerProductIdentity.count(),
    prisma.retailerProductIdentity.count({ where: { productId: { not: null } } }),
    prisma.priceQuote.count(),
    prisma.priceQuote.count({ where: { source: "catalog_estimate" } }),
    prisma.priceQuote.count({ where: { source: { in: VERIFIED_SOURCES } } }),
    prisma.priceQuote.count({
      where: { source: { in: VERIFIED_SOURCES }, expiresAt: { gt: now } },
    }),
    prisma.priceQuote.count({
      where: { source: { in: VERIFIED_SOURCES }, expiresAt: { lte: now } },
    }),
    prisma.priceQuote.count({
      where: {
        source: { in: VERIFIED_SOURCES },
        expiresAt: { gt: now },
        fetchedAt: { lt: staleCutoff },
      },
    }),
    prisma.priceQuote.findMany({
      where: { source: { in: VERIFIED_SOURCES }, expiresAt: { gt: now } },
      select: { productId: true, retailerId: true, fetchedAt: true },
    }),
    prisma.retailerProductIdentity.findMany({
      select: { retailerId: true, productId: true },
    }),
  ]);

  const productRetailers = new Map<string, Set<string>>();
  for (const q of activeQuotes) {
    let set = productRetailers.get(q.productId);
    if (!set) {
      set = new Set();
      productRetailers.set(q.productId, set);
    }
    set.add(q.retailerId);
  }

  const productsWithActiveVerified = productRetailers.size;
  const overlap2 = [...productRetailers.values()].filter((s) => s.size >= 2).length;
  const overlap3 = [...productRetailers.values()].filter((s) => s.size >= 3).length;
  const avgRetailers =
    productsWithActiveVerified ?
      [...productRetailers.values()].reduce((a, s) => a + s.size, 0) /
        productsWithActiveVerified
    : 0;

  const freshActive = activeVerifiedQuotes - staleActiveVerifiedQuotes;
  const freshnessPct =
    activeVerifiedQuotes > 0 ? (freshActive / activeVerifiedQuotes) * 100 : 0;
  const stalePct =
    activeVerifiedQuotes > 0 ?
      (staleActiveVerifiedQuotes / activeVerifiedQuotes) * 100
    : 0;

  const retailerOverlapPct =
    productsWithActiveVerified > 0 ?
      (overlap2 / productsWithActiveVerified) * 100
    : 0;

  const products = await prisma.product.findMany({
    select: {
      id: true,
      category: true,
      catalogId: true,
      priceQuotes: {
        select: { source: true, retailerId: true, expiresAt: true, fetchedAt: true },
      },
    },
  });

  const byCategoryMap = new Map<string, CategoryInventoryRow>();
  for (const p of products) {
    let row = byCategoryMap.get(p.category);
    if (!row) {
      row = {
        category: p.category,
        canonicalCount: 0,
        activeVerified: 0,
        expiredVerified: 0,
        estimateOnly: 0,
        avgRetailers: 0,
        overlap2Plus: 0,
        productionUsable: 0,
      };
      byCategoryMap.set(p.category, row);
    }
    row.canonicalCount += 1;

    const verified = p.priceQuotes.filter((q) => VERIFIED_SOURCES.includes(q.source));
    const active = verified.filter((q) => q.expiresAt > now);
    const expired = verified.filter((q) => q.expiresAt <= now);
    const estimates = p.priceQuotes.filter((q) => q.source === "catalog_estimate");

    if (active.length > 0) row.activeVerified += 1;
    else if (expired.length > 0) row.expiredVerified += 1;
    else if (estimates.length > 0) row.estimateOnly += 1;

    const retailers = new Set(active.map((q) => q.retailerId));
    if (retailers.size >= 2) row.overlap2Plus += 1;

    const grade = operational.productGrades.find((g) => g.catalogId === p.catalogId);
    if (grade && (grade.grade === "A" || grade.grade === "B")) {
      row.productionUsable += 1;
    }
  }

  const byCategory = [...byCategoryMap.values()].sort(
    (a, b) => b.canonicalCount - a.canonicalCount,
  );

  const retailerCounts = new Map<string, { total: number; active: number }>();
  for (const q of await prisma.priceQuote.groupBy({
    by: ["retailerId"],
    _count: { id: true },
    where: { source: { in: VERIFIED_SOURCES } },
  })) {
    retailerCounts.set(q.retailerId, { total: q._count.id, active: 0 });
  }
  for (const q of activeQuotes) {
    const bucket = retailerCounts.get(q.retailerId) ?? { total: 0, active: 0 };
    bucket.active += 1;
    retailerCounts.set(q.retailerId, bucket);
  }

  const byRetailerVerified = [...retailerCounts.entries()]
    .map(([retailerId, v]) => ({ retailerId, ...v }))
    .sort((a, b) => b.total - a.total);

  void identities;

  const flagshipIds = new Set(getFlagshipCatalogIds());
  const flagshipProducts = products.filter((p) => flagshipIds.has(p.catalogId));
  let flagshipActive = 0;
  let flagshipProdUsable = 0;
  let flagshipOverlap2 = 0;
  for (const p of flagshipProducts) {
    const verified = p.priceQuotes.filter((q) => VERIFIED_SOURCES.includes(q.source));
    const active = verified.filter((q) => q.expiresAt > now);
    if (active.length > 0) flagshipActive += 1;
    const retailers = new Set(active.map((q) => q.retailerId));
    if (retailers.size >= 2) flagshipOverlap2 += 1;
    const grade = operational.productGrades.find((g) => g.catalogId === p.catalogId);
    if (grade && (grade.grade === "A" || grade.grade === "B")) flagshipProdUsable += 1;
  }

  const allVerifiedQuotes = await prisma.priceQuote.findMany({
    where: { source: { in: VERIFIED_SOURCES } },
    select: {
      matchConfidence: true,
      imageConfidence: true,
      expiresAt: true,
    },
  });

  const activeAll = allVerifiedQuotes.filter((q) => q.expiresAt > now);
  const lowConf = activeAll.filter(
    (q) => (q.matchConfidence ?? 0) < MIN_CONSUMER_MATCH_CONFIDENCE,
  ).length;
  const lowImg = activeAll.filter(
    (q) => (q.imageConfidence ?? 0) > 0 && (q.imageConfidence ?? 0) < 0.4,
  ).length;
  const consumerPass = activeAll.filter(
    (q) =>
      (q.matchConfidence ?? 0) >= MIN_CONSUMER_MATCH_CONFIDENCE &&
      (q.imageConfidence ?? 0.5) >= 0.4,
  ).length;

  const buckets = [
    { label: "≥0.92 exact", min: 0.92 },
    { label: "0.72–0.92", min: 0.72 },
    { label: "0.58–0.72", min: 0.58 },
    { label: "<0.58 low", min: 0 },
  ];
  const matchConfidenceBuckets = buckets.map((b, i) => {
    const max = i === 0 ? 1.01 : buckets[i - 1]!.min;
    const count = allVerifiedQuotes.filter((q) => {
      const c = q.matchConfidence ?? 0;
      return c >= b.min && c < max;
    }).length;
    return {
      bucket: b.label,
      count,
      pct: allVerifiedQuotes.length ?
        Math.round((count / allVerifiedQuotes.length) * 1000) / 10
      : 0,
    };
  });

  const freshnessFailurePct =
    verifiedQuoteRows > 0 ?
      Math.round((expiredVerifiedQuotes / verifiedQuoteRows) * 1000) / 10
    : 0;

  return {
    generatedAt: now.toISOString(),
    inMemoryCatalogSize: CATALOG.length,
    canonicalProductCount,
    variantGroupCount,
    productIdentifierCount,
    uniqueRetailerPdps,
    linkedRetailerPdps,
    totalPriceQuoteRows,
    estimateQuoteRows,
    verifiedQuoteRows,
    activeVerifiedQuotes,
    expiredVerifiedQuotes,
    staleActiveVerifiedQuotes,
    productsWithActiveVerified,
    productsWith2PlusRetailers: overlap2,
    productsWith3PlusRetailers: overlap3,
    retailerOverlapPct,
    avgRetailersPerActiveProduct: Math.round(avgRetailers * 100) / 100,
    freshnessPct,
    stalePct,
    byCategory,
    byRetailerVerified,
    gradeDistribution: operational.gradeDistribution,
    productionUsable: operational.coverage.productionUsable,
    operational,
    ingestionProfiles: getRetailerIngestionProfiles(),
    flagship: {
      count: flagshipIds.size,
      activeVerified: flagshipActive,
      productionUsable: flagshipProdUsable,
      overlap2Plus: flagshipOverlap2,
    },
    trustMetrics: {
      freshnessFailurePct,
      lowConfidencePct:
        activeAll.length ?
          Math.round((lowConf / activeAll.length) * 1000) / 10
        : 0,
      lowImageConfidencePct:
        activeAll.length ?
          Math.round((lowImg / activeAll.length) * 1000) / 10
        : 0,
      consumerTrustPassPct:
        activeAll.length ?
          Math.round((consumerPass / activeAll.length) * 1000) / 10
        : 0,
      matchConfidenceBuckets,
    },
  };
}
