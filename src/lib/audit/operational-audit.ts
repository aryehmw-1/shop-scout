/**
 * Operational audit — measurable production readiness from DB truth.
 * No optimistic catalog counts; separates catalog entries from production-usable products.
 */

import { prisma } from "../db/prisma.ts";

const VERIFIED_SOURCES = new Set([
  "scraped",
  "connector_api",
  "daily_index",
  "nightly_index",
]);
const ESTIMATE_SOURCES = new Set(["catalog_estimate"]);
const STALE_HOURS = 48;
const HIGH_CONFIDENCE = 0.8;
const EXACT_MATCH = 0.92;

export type ProductGrade = "A" | "B" | "unstable" | "unusable";
export type RetailerClass =
  | "production-ready"
  | "usable-with-caveats"
  | "unstable"
  | "unusable";

export interface ProductCoverageInventory {
  totalCatalogProducts: number;
  totalCanonicalCatalogIds: number;
  withVerifiedOffers: number;
  withExpiredVerifiedOffers: number;
  withEstimatedOnly: number;
  withZeroUsableOffers: number;
  withStaleOffers: number;
  withHighConfidenceMatching: number;
  productionUsable: number;
  pctVerified: number;
  pctProductionUsable: number;
  byCategory: CategoryCoverageRow[];
}

export interface CategoryCoverageRow {
  category: string;
  catalogCount: number;
  verified: number;
  estimatedOnly: number;
  zeroOffers: number;
  stale: number;
  highConfidence: number;
  productionUsable: number;
  avgRetailerDiversity: number;
  avgFreshnessHours: number | null;
}

export interface RetailerReliabilityRow {
  retailerId: string;
  scrapeSuccessRate: number | null;
  pdpValidationRate: number | null;
  imageExtractionRate: number | null;
  verifiedPriceRate: number | null;
  blockFrequency: number | null;
  avgLatencyMs: number | null;
  retryFrequency: number | null;
  offerRejectionRate: number | null;
  parserStabilityScore: number | null;
  trustScore: number;
  classification: RetailerClass;
  verifiedQuoteCount: number;
  estimatedQuoteCount: number;
  dataSource: "metrics_table" | "quotes_inferred";
}

export interface ProductGradeRow {
  catalogId: string;
  title: string;
  brand: string;
  category: string;
  grade: ProductGrade;
  score: number;
  verifiedCount: number;
  retailerDiversity: number;
  avgMatchConfidence: number | null;
  avgImageConfidence: number | null;
  freshnessHours: number | null;
  hasUpc: boolean;
  issues: string[];
}

export interface CategoryViabilityRow {
  category: string;
  productCount: number;
  avgGradeScore: number;
  verifiedRate: number;
  avgMatchConfidence: number | null;
  avgRetailerDiversity: number;
  scrapeQuality: "good" | "mixed" | "poor";
  matchingQuality: "good" | "mixed" | "poor";
  recommendation: string;
}

export interface ExactMatchingStats {
  productsWithUpc: number;
  productsWithGtin: number;
  identifierRows: number;
  quotesExactMatch: number;
  quotesSimilarMatch: number;
  quotesLowConfidence: number;
  exactMatchRate: number | null;
  avgMatchConfidence: number | null;
  architecture: {
    upcGtin: string;
    titleNormalization: string;
    brandExtraction: string;
    sizeParsing: string;
    colorParsing: string;
    duplicateDetection: string;
    canonicalIdentity: string;
    variantResolution: string;
  };
}

export interface OperationalAuditReport {
  generatedAt: string;
  coverage: ProductCoverageInventory;
  retailers: RetailerReliabilityRow[];
  productGrades: ProductGradeRow[];
  gradeDistribution: Record<ProductGrade, number>;
  top20: ProductGradeRow[];
  worst20: ProductGradeRow[];
  categories: CategoryViabilityRow[];
  exactMatching: ExactMatchingStats;
  scalability: ScalabilityAnalysis;
  scalingRoadmap: ScalingRoadmap;
  indexingWalkthrough: string;
  learningEvents: {
    searches24h: number;
    clicks24h: number;
    enrichmentLatencyAvgMs: number | null;
    cacheHitRate: number | null;
  };
}

export interface ScalabilityAnalysis {
  currentProducts: number;
  currentQuotes: number;
  dbBottlenecks: string[];
  scrapeConcurrency: string;
  antiBotExposure: string;
  memoryProfile: string;
  indexingRuntimeGrowth: string;
  scalesLinearly: string[];
  scalesPoorly: string[];
  redesignBeforeExpansion: string[];
}

export interface ScalingRoadmap {
  targetProducts: number;
  prioritizeCategories: string[];
  prioritizeRetailers: string[];
  avoidRetailers: string[];
  apiRequired: string[];
  scrapeAcceptable: string[];
  hybridNeeded: string[];
  humanCurationNeeded: string[];
  phases: { phase: string; goal: string; actions: string[] }[];
}

function isVerifiedSource(source: string): boolean {
  return VERIFIED_SOURCES.has(source);
}

function hoursSince(d: Date): number {
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

function classifyRetailer(row: {
  trustScore: number;
  scrapeSuccessRate: number | null;
  parserStabilityScore: number | null;
  offerRejectionRate: number | null;
  verifiedQuoteCount: number;
}): RetailerClass {
  const fetch = row.scrapeSuccessRate ?? 0;
  const parser = row.parserStabilityScore ?? 0;
  const trust = row.trustScore;

  if (trust >= 0.7 && fetch >= 0.7 && parser >= 0.7 && row.verifiedQuoteCount >= 3) {
    return "production-ready";
  }
  if (trust >= 0.5 && fetch >= 0.4 && row.verifiedQuoteCount >= 1) {
    return "usable-with-caveats";
  }
  if (fetch >= 0.15 || row.verifiedQuoteCount >= 1) {
    return "unstable";
  }
  return "unusable";
}

function gradeProduct(input: {
  verifiedCount: number;
  estimatedCount: number;
  retailerDiversity: number;
  avgMatchConfidence: number | null;
  avgImageConfidence: number | null;
  freshnessHours: number | null;
  verificationCount: number;
  hasUpc: boolean;
  duplicateRetailers: number;
}): { grade: ProductGrade; score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 0;

  if (input.verifiedCount === 0) {
    if (input.estimatedCount > 0) {
      issues.push("Only catalog estimates — no verified live prices");
      return { grade: "unusable", score: 10, issues };
    }
    issues.push("Zero usable offers");
    return { grade: "unusable", score: 0, issues };
  }

  score += Math.min(25, input.verifiedCount * 8);
  score += Math.min(15, input.retailerDiversity * 5);
  if (input.avgMatchConfidence != null) {
    score += Math.round(input.avgMatchConfidence * 20);
    if (input.avgMatchConfidence < 0.7) issues.push("Low match confidence");
  }
  if (input.avgImageConfidence != null) {
    score += Math.round(input.avgImageConfidence * 10);
    if (input.avgImageConfidence < 0.5) issues.push("Poor image quality");
  }
  if (input.freshnessHours != null) {
    if (input.freshnessHours <= 24) score += 15;
    else if (input.freshnessHours <= 48) score += 10;
    else if (input.freshnessHours <= 72) score += 5;
    else issues.push("Stale verified offers");
  } else {
    issues.push("Unknown freshness");
  }
  if (input.verificationCount >= 3) score += 10;
  if (input.hasUpc) score += 5;
  if (input.duplicateRetailers > 0) {
    score -= input.duplicateRetailers * 5;
    issues.push("Duplicate retailer rows");
  }
  if (input.retailerDiversity < 2) {
    issues.push("Single-retailer coverage — no real comparison");
  }

  score = Math.max(0, Math.min(100, score));

  let grade: ProductGrade;
  if (
    score >= 80 &&
    input.verifiedCount >= 2 &&
    input.retailerDiversity >= 2 &&
    (input.avgMatchConfidence ?? 0) >= 0.75 &&
    (input.freshnessHours ?? 999) <= 48
  ) {
    grade = "A";
  } else if (score >= 60 && input.verifiedCount >= 1) {
    grade = "B";
  } else if (score >= 30) {
    grade = "unstable";
  } else {
    grade = "unusable";
  }

  return { grade, score, issues };
}

export async function runOperationalAudit(): Promise<OperationalAuditReport> {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_HOURS * 60 * 60 * 1000);
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const products = await prisma.product.findMany({
    select: {
      id: true,
      catalogId: true,
      title: true,
      brand: true,
      category: true,
      upc: true,
      gtin: true,
      priceQuotes: {
        select: {
          source: true,
          retailerId: true,
          matchConfidence: true,
          imageConfidence: true,
          imageUrl: true,
          fetchedAt: true,
          expiresAt: true,
        },
      },
      priceStats: {
        select: { verificationCount: true },
      },
    },
  });

  const metricsRows = await prisma.retailerQualityMetric.findMany();
  const metricsByRetailer = new Map(metricsRows.map((m) => [m.retailerId, m]));

  const allQuotes = products.flatMap((p) =>
    p.priceQuotes.map((q) => ({ ...q, catalogId: p.catalogId, productId: p.id })),
  );

  const allVerifiedQuotes = allQuotes.filter((q) => isVerifiedSource(q.source));

  const quoteByRetailer = new Map<
    string,
    {
      verified: number;
      estimated: number;
      withImage: number;
      highConf: number;
      fetchLatencies: number[];
      blocks: number;
    }
  >();

  for (const q of allVerifiedQuotes) {
    let bucket = quoteByRetailer.get(q.retailerId);
    if (!bucket) {
      bucket = {
        verified: 0,
        estimated: 0,
        withImage: 0,
        highConf: 0,
        fetchLatencies: [],
        blocks: 0,
      };
      quoteByRetailer.set(q.retailerId, bucket);
    }
    if (isVerifiedSource(q.source)) bucket.verified += 1;
    if (ESTIMATE_SOURCES.has(q.source)) bucket.estimated += 1;
    if (q.imageUrl && (q.imageConfidence ?? 0) >= 0.4) bucket.withImage += 1;
    if ((q.matchConfidence ?? 0) >= HIGH_CONFIDENCE) bucket.highConf += 1;
  }

  const retailers: RetailerReliabilityRow[] = [];
  const retailerIds = new Set([
    ...metricsRows.map((m) => m.retailerId),
    ...quoteByRetailer.keys(),
  ]);

  for (const retailerId of [...retailerIds].sort()) {
    const m = metricsByRetailer.get(retailerId);
    const q = quoteByRetailer.get(retailerId);
    const dataSource = m ? "metrics_table" : "quotes_inferred";

    const fetchAttempts = m?.fetchAttempts ?? 0;
    const scrapeSuccessRate =
      m && fetchAttempts > 0 ? m.fetchSuccesses / fetchAttempts
      : q && q.verified > 0 ? Math.min(1, q.verified / (q.verified + q.estimated + 1))
      : null;

    const parserAttempts = m?.parserAttempts ?? 0;
    const parserStabilityScore =
      m && parserAttempts > 0 ? m.parserSuccesses / parserAttempts : scrapeSuccessRate;

    const acceptTotal = (m?.offersAccepted ?? 0) + (m?.offersRejected ?? 0);
    const offerRejectionRate =
      acceptTotal > 0 ? (m!.offersRejected / acceptTotal)
      : q && q.estimated > q.verified ? 0.5
      : null;

    const verifiedTotal = q?.verified ?? 0;
    const imageRate =
      verifiedTotal > 0 && q ?
        Math.min(1, q.withImage / verifiedTotal)
      : null;

    retailers.push({
      retailerId,
      scrapeSuccessRate,
      pdpValidationRate: parserStabilityScore,
      imageExtractionRate: imageRate,
      verifiedPriceRate:
        verifiedTotal + (q?.estimated ?? 0) > 0 ?
          verifiedTotal / (verifiedTotal + (q?.estimated ?? 0))
        : null,
      blockFrequency:
        m && fetchAttempts > 0 ?
          1 - m.fetchSuccesses / fetchAttempts
        : null,
      avgLatencyMs: m?.avgFetchLatencyMs ?? null,
      retryFrequency: null,
      offerRejectionRate,
      parserStabilityScore,
      trustScore: m?.trustScore ?? (scrapeSuccessRate != null ? scrapeSuccessRate * 0.6 + 0.2 : 0.35),
      classification: "unusable",
      verifiedQuoteCount: verifiedTotal,
      estimatedQuoteCount: q?.estimated ?? 0,
      dataSource,
    });
  }

  for (const r of retailers) {
    r.classification = classifyRetailer(r);
  }

  const productGrades: ProductGradeRow[] = [];
  let withVerified = 0;
  let withExpiredVerified = 0;
  let estimatedOnly = 0;
  let zeroOffers = 0;
  let withStale = 0;
  let highConf = 0;
  let productionUsable = 0;

  const categoryAgg = new Map<
    string,
    {
      catalogCount: number;
      verified: number;
      estimatedOnly: number;
      zeroOffers: number;
      stale: number;
      highConfidence: number;
      productionUsable: number;
      retailerDivSum: number;
      freshnessSum: number;
      freshnessCount: number;
    }
  >();

  for (const p of products) {
    const verified = p.priceQuotes.filter((q) => isVerifiedSource(q.source));
    const estimated = p.priceQuotes.filter((q) => ESTIMATE_SOURCES.has(q.source));
    const activeVerified = verified.filter((q) => q.expiresAt > now);
    const expiredVerified = verified.filter((q) => q.expiresAt <= now);
    const retailersSet = new Set(activeVerified.map((q) => q.retailerId));
    const staleVerified = activeVerified.some((q) => q.fetchedAt < staleCutoff);

    const avgMatch =
      activeVerified.length ?
        activeVerified.reduce((s, q) => s + q.matchConfidence, 0) / activeVerified.length
      : null;
    const avgImage =
      activeVerified.length ?
        activeVerified.reduce((s, q) => s + (q.imageConfidence ?? 0), 0) /
          activeVerified.length
      : null;
    const freshest =
      activeVerified.length ?
        Math.min(...activeVerified.map((q) => hoursSince(q.fetchedAt)))
      : null;
    const verificationCount = p.priceStats.reduce((s, x) => s + x.verificationCount, 0);

    const retailerCounts = new Map<string, number>();
    for (const q of activeVerified) {
      retailerCounts.set(q.retailerId, (retailerCounts.get(q.retailerId) ?? 0) + 1);
    }
    const duplicateRetailers = [...retailerCounts.values()].filter((c) => c > 1).length;

    const { grade, score, issues } = gradeProduct({
      verifiedCount: activeVerified.length,
      estimatedCount: estimated.length,
      retailerDiversity: retailersSet.size,
      avgMatchConfidence: avgMatch,
      avgImageConfidence: avgImage,
      freshnessHours: freshest,
      verificationCount,
      hasUpc: Boolean(p.upc || p.gtin),
      duplicateRetailers,
    });

    productGrades.push({
      catalogId: p.catalogId,
      title: p.title,
      brand: p.brand,
      category: p.category,
      grade,
      score,
      verifiedCount: activeVerified.length,
      retailerDiversity: retailersSet.size,
      avgMatchConfidence: avgMatch,
      avgImageConfidence: avgImage,
      freshnessHours: freshest,
      hasUpc: Boolean(p.upc || p.gtin),
      issues,
    });

    if (activeVerified.length > 0) withVerified += 1;
    else if (expiredVerified.length > 0) withExpiredVerified += 1;
    else if (estimated.length > 0) estimatedOnly += 1;
    else zeroOffers += 1;
    if (staleVerified) withStale += 1;
    if (avgMatch != null && avgMatch >= HIGH_CONFIDENCE) highConf += 1;
    if (
      grade === "A" ||
      (grade === "B" && activeVerified.length >= 1 && retailersSet.size >= 1)
    ) {
      productionUsable += 1;
    }

    let cat = categoryAgg.get(p.category);
    if (!cat) {
      cat = {
        catalogCount: 0,
        verified: 0,
        estimatedOnly: 0,
        zeroOffers: 0,
        stale: 0,
        highConfidence: 0,
        productionUsable: 0,
        retailerDivSum: 0,
        freshnessSum: 0,
        freshnessCount: 0,
      };
      categoryAgg.set(p.category, cat);
    }
    cat.catalogCount += 1;
    if (activeVerified.length > 0) cat.verified += 1;
    else if (estimated.length > 0) cat.estimatedOnly += 1;
    else cat.zeroOffers += 1;
    if (staleVerified) cat.stale += 1;
    if (avgMatch != null && avgMatch >= HIGH_CONFIDENCE) cat.highConfidence += 1;
    if (grade === "A" || grade === "B") cat.productionUsable += 1;
    cat.retailerDivSum += retailersSet.size;
    if (freshest != null) {
      cat.freshnessSum += freshest;
      cat.freshnessCount += 1;
    }
  }

  const byCategory: CategoryCoverageRow[] = [...categoryAgg.entries()]
    .map(([category, c]) => ({
      category,
      catalogCount: c.catalogCount,
      verified: c.verified,
      estimatedOnly: c.estimatedOnly,
      zeroOffers: c.zeroOffers,
      stale: c.stale,
      highConfidence: c.highConfidence,
      productionUsable: c.productionUsable,
      avgRetailerDiversity: c.catalogCount ? c.retailerDivSum / c.catalogCount : 0,
      avgFreshnessHours:
        c.freshnessCount ? c.freshnessSum / c.freshnessCount : null,
    }))
    .sort((a, b) => b.catalogCount - a.catalogCount);

  const gradeDistribution: Record<ProductGrade, number> = {
    A: 0,
    B: 0,
    unstable: 0,
    unusable: 0,
  };
  for (const pg of productGrades) gradeDistribution[pg.grade] += 1;

  const sorted = [...productGrades].sort((a, b) => b.score - a.score);
  const top20 = sorted.filter((p) => p.grade === "A" || p.grade === "B").slice(0, 20);
  const worst20 = [...productGrades]
    .sort((a, b) => a.score - b.score)
    .slice(0, 20);

  const categories: CategoryViabilityRow[] = byCategory.map((c) => {
    const catProducts = productGrades.filter((p) => p.category === c.category);
    const avgScore =
      catProducts.length ?
        catProducts.reduce((s, p) => s + p.score, 0) / catProducts.length
      : 0;
    const verifiedRate = c.catalogCount ? c.verified / c.catalogCount : 0;
    const avgConf =
      catProducts.length ?
        catProducts
          .filter((p) => p.avgMatchConfidence != null)
          .reduce((s, p) => s + p.avgMatchConfidence!, 0) /
          Math.max(1, catProducts.filter((p) => p.avgMatchConfidence != null).length)
      : null;

    const scrapeQ =
      verifiedRate >= 0.5 ? "good"
      : verifiedRate >= 0.2 ? "mixed"
      : "poor";
    const matchQ =
      avgConf != null && avgConf >= 0.8 ? "good"
      : avgConf != null && avgConf >= 0.6 ? "mixed"
      : "poor";

    let recommendation = "Monitor";
    if (scrapeQ === "good" && matchQ === "good") recommendation = "Expand first";
    else if (scrapeQ === "poor") recommendation = "Defer until retailer reliability improves";
    else if (matchQ === "poor") recommendation = "Needs identity/curation work";

    return {
      category: c.category,
      productCount: c.catalogCount,
      avgGradeScore: avgScore,
      verifiedRate,
      avgMatchConfidence: avgConf,
      avgRetailerDiversity: c.avgRetailerDiversity,
      scrapeQuality: scrapeQ,
      matchingQuality: matchQ,
      recommendation,
    };
  });

  const identifierRows = await prisma.productIdentifier.count();
  const productsWithUpc = products.filter((p) => p.upc).length;
  const productsWithGtin = products.filter((p) => p.gtin).length;

  let quotesExact = 0;
  let quotesSimilar = 0;
  let quotesLow = 0;
  for (const q of allQuotes.filter((x) => isVerifiedSource(x.source))) {
    if (q.matchConfidence >= EXACT_MATCH) quotesExact += 1;
    else if (q.matchConfidence >= 0.7) quotesSimilar += 1;
    else quotesLow += 1;
  }
  const verifiedQuoteCount = allQuotes.filter((q) => isVerifiedSource(q.source)).length;
  const avgMatchAll =
    verifiedQuoteCount ?
      allQuotes
        .filter((q) => isVerifiedSource(q.source))
        .reduce((s, q) => s + q.matchConfidence, 0) / verifiedQuoteCount
    : null;

  const [searches24h, clicks24h, enrichEvents, searchFirstEvents] = await Promise.all([
    prisma.learningEvent.count({
      where: { kind: "search_performed", createdAt: { gte: since24h } },
    }),
    prisma.learningEvent.count({
      where: {
        kind: { in: ["offer_click", "best_deal_click"] },
        createdAt: { gte: since24h },
      },
    }),
    prisma.learningEvent.findMany({
      where: { kind: "enrichment_completed", createdAt: { gte: since24h } },
      select: { payloadJson: true },
      take: 200,
    }),
    prisma.learningEvent.findMany({
      where: { kind: "search_first_results", createdAt: { gte: since24h } },
      select: { payloadJson: true },
      take: 200,
    }),
  ]);

  let enrichLatencySum = 0;
  let enrichLatencyN = 0;
  for (const e of enrichEvents) {
    try {
      const p = JSON.parse(e.payloadJson) as { latencyMs?: number };
      if (p.latencyMs != null) {
        enrichLatencySum += p.latencyMs;
        enrichLatencyN += 1;
      }
    } catch {
      /* skip */
    }
  }

  let cacheHits = 0;
  let cacheTotal = 0;
  for (const e of searchFirstEvents) {
    try {
      const p = JSON.parse(e.payloadJson) as { cacheHit?: boolean };
      cacheTotal += 1;
      if (p.cacheHit) cacheHits += 1;
    } catch {
      /* skip */
    }
  }

  const totalCatalog = products.length;
  const coverage: ProductCoverageInventory = {
    totalCatalogProducts: totalCatalog,
    totalCanonicalCatalogIds: totalCatalog,
    withVerifiedOffers: withVerified,
    withExpiredVerifiedOffers: withExpiredVerified,
    withEstimatedOnly: estimatedOnly,
    withZeroUsableOffers: zeroOffers,
    withStaleOffers: withStale,
    withHighConfidenceMatching: highConf,
    productionUsable,
    pctVerified: totalCatalog ? (withVerified / totalCatalog) * 100 : 0,
    pctProductionUsable: totalCatalog ? (productionUsable / totalCatalog) * 100 : 0,
    byCategory,
  };

  return {
    generatedAt: now.toISOString(),
    coverage,
    retailers: retailers.sort((a, b) => b.trustScore - a.trustScore),
    productGrades,
    gradeDistribution,
    top20,
    worst20,
    categories,
    exactMatching: {
      productsWithUpc,
      productsWithGtin,
      identifierRows,
      quotesExactMatch: quotesExact,
      quotesSimilarMatch: quotesSimilar,
      quotesLowConfidence: quotesLow,
      exactMatchRate: verifiedQuoteCount ? quotesExact / verifiedQuoteCount : null,
      avgMatchConfidence: avgMatchAll,
      architecture: {
        upcGtin: `${productsWithUpc}/${totalCatalog} products have UPC; ${identifierRows} identifier rows in ProductIdentifier`,
        titleNormalization: "query-normalize.ts + formatSearchProductTitle at display",
        brandExtraction: "BrandCanonical table + brandCanonical on Product",
        sizeParsing: "Catalog sizeLabel + variant size rows",
        colorParsing: "VariantGroup.colorNormalized",
        duplicateDetection: "RetailerProductIdentity unique (retailerId, productUrl); ASIN dedup in amazon-validation",
        canonicalIdentity: "Product.catalogId unique slug; resolveCatalogRow for variants",
        variantResolution: "VariantGroup → ProductVariant via resolve-variant.ts",
      },
    },
    scalability: buildScalabilityAnalysis(totalCatalog, allQuotes.length, retailers),
    scalingRoadmap: buildScalingRoadmap(coverage, retailers, categories),
    indexingWalkthrough: INDEXING_WALKTHROUGH,
    learningEvents: {
      searches24h,
      clicks24h,
      enrichmentLatencyAvgMs:
        enrichLatencyN ? enrichLatencySum / enrichLatencyN : null,
      cacheHitRate: cacheTotal ? cacheHits / cacheTotal : null,
    },
  };
}

function buildScalabilityAnalysis(
  products: number,
  quotes: number,
  retailers: RetailerReliabilityRow[],
): ScalabilityAnalysis {
  const blockedRetailers = retailers.filter(
    (r) => r.classification === "unusable" || r.classification === "unstable",
  ).length;

  return {
    currentProducts: products,
    currentQuotes: quotes,
    dbBottlenecks: [
      "SQLite single-writer — PriceQuote createMany per product blocks at scale",
      "No quote partitioning — all retailers × products in one table",
      "LearningEvent append-only growth without TTL/archival",
      "Product search loads full quote graph per catalogId",
    ],
    scrapeConcurrency: "Sequential per product (~350ms delay) × 5 retailers × PDP fetch — ~2–8s/product",
    antiBotExposure: `${blockedRetailers}/${retailers.length} retailers unstable/unusable without residential proxy`,
    memoryProfile: "Full CATALOG loaded in memory during index; enrich holds HTML buffers per retailer",
    indexingRuntimeGrowth: `~O(products × retailers × PDP_depth). 200 products × 5 retailers ≈ 15–45 min sequential`,
    scalesLinearly: [
      "Catalog Product rows",
      "PriceHistory append observations",
      "Search sessions / analytics events",
    ],
    scalesPoorly: [
      "Live scrape fan-out per search (no queue)",
      "Nightly index without worker pool",
      "Image fetch per offer on INDEX_FETCH_RETAILER_IMAGES=true",
      "SQLite under concurrent search + index writes",
    ],
    redesignBeforeExpansion: [
      "PostgreSQL + connection pooling for production",
      "Job queue for scrape/enrich (BullMQ/SQS) with per-retailer rate limits",
      "Residential proxy pool for Walmart/Target/Kroger/Costco",
      "Quote cache layer (Redis) with TTL aligned to verification tier",
      "Separate read replica or materialized search index for compare grid",
    ],
  };
}

function buildScalingRoadmap(
  coverage: ProductCoverageInventory,
  retailers: RetailerReliabilityRow[],
  categories: CategoryViabilityRow[],
): ScalingRoadmap {
  const goodCats = categories
    .filter((c) => c.recommendation === "Expand first")
    .map((c) => c.category);
  const prodRetailers = retailers
    .filter((r) => r.classification === "production-ready")
    .map((r) => r.retailerId);
  const caveats = retailers
    .filter((r) => r.classification === "usable-with-caveats")
    .map((r) => r.retailerId);
  const avoid = retailers
    .filter((r) => r.classification === "unusable")
    .map((r) => r.retailerId);

  return {
    targetProducts: 200,
    prioritizeCategories: goodCats.length ? goodCats : ["salad", "dairy", "household", "pantry"],
    prioritizeRetailers: prodRetailers.length ? prodRetailers : ["amazon"],
    avoidRetailers: avoid.length ? avoid : ["walmart", "target", "kroger", "costco"],
    apiRequired: ["amazon (PA-API fallback)", "costco (likely API or curated feeds)"],
    scrapeAcceptable: ["amazon HTML adapter", "aldi (lower bot pressure)"],
    hybridNeeded: ["walmart", "target", "kroger — proxy + API where available"],
    humanCurationNeeded: [
      "Apparel/shoes variant disambiguation",
      "Electronics MPN matching",
      "Flagship demo product selection (top 20)",
    ],
    phases: [
      {
        phase: "Phase 0 — Truth baseline (now)",
        goal: `${coverage.productionUsable}/${coverage.totalCatalogProducts} production-usable today`,
        actions: [
          "Run operational audit weekly",
          "Populate RetailerQualityMetric via index + search enrich",
          "Unset invalid INDEX_PROXY_LIST until real credentials",
        ],
      },
      {
        phase: "Phase 1 — 50 flagship products",
        goal: "A-grade demo set with 3+ verified retailers each",
        actions: [
          "Curate top 20 from audit",
          "Fix worst 20 or remove from default catalog",
          "Amazon + 1–2 working scrape retailers per product",
        ],
      },
      {
        phase: "Phase 2 — 100 products",
        goal: "Category expansion in easiest verticals only",
        actions: [
          "PostgreSQL migration",
          "Scrape job queue with retailer rate limits",
          "Proxy pool for blocked retailers",
        ],
      },
      {
        phase: "Phase 3 — 200+ products",
        goal: "Quality-first catalog, not full CATALOG sync",
        actions: [
          "Human curation for apparel/electronics",
          "API partnerships where scrape ROI is negative",
          "Materialized compare snapshots per catalogId",
        ],
      },
    ],
  };
}

const INDEXING_WALKTHROUGH = `
## Full indexing pipeline (one product)

1. **Query normalization** — N/A at index time; intent built from catalog brand+title (\`intentForCatalogItem\`).
2. **Canonical resolution** — \`resolveCatalogRow\` picks variant group/size from catalog row.
3. **Retailer targeting** — Weekly rotation plan or full index selects retailersTonight (CORE: amazon,walmart,target,costco,kroger).
4. **Compare grid (estimates)** — \`compareProduct\` builds baseline offers from catalog listings.
5. **Amazon PA-API** — If configured, live quotes merged via \`mergeLivePrices\`.
6. **Image + PDP enrich** — \`enrichIndexSearchResults\`: retailer adapters fetch PDP, extract price/image.
7. **Validation** — \`offer-persist-validation\` + \`amazon-validation\`; rejected offers never persisted.
8. **Price history** — \`finalizePricesWithHistory\` writes snapshots + rolling stats.
9. **Persist** — \`persistNightlySearchResults\` writes validated rows to PriceQuote (source: daily_index).
10. **Caching** — Search reads PriceQuote via search-service cache (60min verified TTL).
11. **UI** — \`prepareResultsForDisplay\` ranks verified-only; Best Deal from deal-intelligence pipeline.
`.trim();
