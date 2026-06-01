/**
 * Retailer readiness report — production audit for Amazon, Target, and registry retailers.
 */
import { prisma } from "../db/prisma";
import {
  getRetailerCapability,
  enrichCapabilityWithMetrics,
  listRetailerCapabilities,
} from "../retailers/acquisition/capability-registry";
import { getRetailerMetadata } from "../retailers/acquisition/retailer-metadata-registry";
import { getTransportPolicy } from "../retailers/acquisition/transport-policy";
import { explainAcquisitionPlan } from "../retailers/acquisition/orchestrator";
import { getAffiliateStatus } from "../affiliate/integration";
import { isAmazonPaapiConfigured } from "../search/providers/amazon-paapi-config";
import { summarizeOrchestrationMetrics } from "../retailers/acquisition/orchestration-metrics";
import type { RetailerId } from "../types";

export type ReadinessStatus = "production_ready" | "partial" | "experimental" | "blocked";

export interface RetailerReadinessRow {
  retailerId: RetailerId;
  displayName: string;
  status: ReadinessStatus;
  works: boolean;
  acquisitionMethod: string;
  confidenceScore: number;
  persistenceStatus: "healthy" | "degraded" | "empty";
  affiliateReadiness: "configured" | "missing" | "n/a";
  challengeRate: number;
  activeQuotes: number;
  totalQuotes: number;
  productsWithQuotes: number;
  productionGaps: string[];
  recommendedNextSteps: string[];
}

export interface RetailerReadinessReport {
  generatedAt: string;
  platformPositioning: string[];
  retailers: RetailerReadinessRow[];
  orchestrationSummary: Awaited<ReturnType<typeof summarizeOrchestrationMetrics>>;
  persistenceDiagnostics: {
    totalProducts: number;
    productsWithoutActiveQuotes: number;
    expiredQuoteRatio: number;
  };
}

const CORE_RETAILERS: RetailerId[] = ["amazon", "target", "walmart"];

function scoreToStatus(
  retailerId: RetailerId,
  confidence: number,
  activeQuotes: number,
  affiliateOk: boolean,
): ReadinessStatus {
  const meta = getRetailerMetadata(retailerId);
  if (meta.businessPriority === "experimental") return "experimental";
  if (retailerId === "amazon" && isAmazonPaapiConfigured() && confidence >= 0.7) {
    return activeQuotes > 0 ? "production_ready" : "partial";
  }
  if (confidence >= 0.65 && activeQuotes >= 5 && affiliateOk) return "production_ready";
  if (confidence >= 0.45 || activeQuotes > 0) return "partial";
  return "blocked";
}

function primaryAcquisitionMethod(retailerId: RetailerId): string {
  const plan = explainAcquisitionPlan({
    retailerId,
    url: `https://example.com/${retailerId}`,
  });
  return plan.orderedMethods[0]?.method ?? getRetailerCapability(retailerId).defaultMethod;
}

export async function generateRetailerReadinessReport(): Promise<RetailerReadinessReport> {
  const now = new Date();
  const capabilities = listRetailerCapabilities().map(enrichCapabilityWithMetrics);
  const orchestrationSummary = await summarizeOrchestrationMetrics();

  const totalProducts = await prisma.product.count();
  const productsWithAnyQuote = await prisma.product.count({
    where: { priceQuotes: { some: { expiresAt: { gt: now } } } },
  });

  const expired = await prisma.priceQuote.count({ where: { expiresAt: { lte: now } } });
  const active = await prisma.priceQuote.count({ where: { expiresAt: { gt: now } } });

  const retailers: RetailerReadinessRow[] = [];

  for (const cap of capabilities) {
    const retailerId = cap.retailerId;
    const meta = getRetailerMetadata(retailerId);
    const policy = getTransportPolicy(retailerId);
    const affiliate = getAffiliateStatus(retailerId);

    const [activeQuotes, totalQuotes, productsWithQuotes] = await Promise.all([
      prisma.priceQuote.count({
        where: { retailerId, expiresAt: { gt: now } },
      }),
      prisma.priceQuote.count({ where: { retailerId } }),
      prisma.product.count({
        where: { priceQuotes: { some: { retailerId, expiresAt: { gt: now } } } },
      }),
    ]);

    const orchRow = orchestrationSummary.retailerReliability.find((r) => r.retailerId === retailerId);
    const confidenceScore =
      orchRow?.avgConfidence && orchRow.attempts >= 3 ?
        orchRow.avgConfidence
      : (cap.extractionConfidence ?? 0.5);
    const challengeRate =
      cap.challengeRate ?? (orchRow ? 1 - (orchRow.successRate ?? 0.5) : 0.5);

    const productionGaps: string[] = [];
    const recommendedNextSteps: string[] = [];

    if (retailerId === "amazon" && !isAmazonPaapiConfigured()) {
      productionGaps.push("Amazon PA-API credentials not configured");
      recommendedNextSteps.push("Set AMAZON_PA_API_ACCESS_KEY, SECRET_KEY, PARTNER_TAG");
    }
    if (!affiliate.programConfigured && meta.partnershipTier !== "research") {
      productionGaps.push("Affiliate tag missing");
      recommendedNextSteps.push(`Configure ${affiliate.clickTrackingPath} env keys`);
    }
    if (activeQuotes === 0) {
      productionGaps.push("No active persisted quotes");
      recommendedNextSteps.push("Run npm run index:full:local with retailer images enabled");
    }
    if (retailerId === "walmart" && policy.tier === "experimental") {
      productionGaps.push("Browser-rendered path experimental — PerimeterX challenge rate high");
      recommendedNextSteps.push("Use cached_structured + merchant feed; keep experiments observability-only");
    }
    if (retailerId === "target" && challengeRate > 0.5) {
      productionGaps.push("Elevated challenge rate on lightweight fetch");
      recommendedNextSteps.push("Enable affiliate feed; prefer cached quotes before browser_rendered");
    }

    const persistenceStatus: RetailerReadinessRow["persistenceStatus"] =
      activeQuotes >= 10 ? "healthy"
      : activeQuotes > 0 ? "degraded"
      : "empty";

    const status = scoreToStatus(
      retailerId,
      confidenceScore,
      activeQuotes,
      affiliate.programConfigured || retailerId === "walmart",
    );

    retailers.push({
      retailerId,
      displayName: meta.displayName,
      status,
      works: activeQuotes > 0 || (retailerId === "amazon" && isAmazonPaapiConfigured()),
      acquisitionMethod: primaryAcquisitionMethod(retailerId),
      confidenceScore: Math.round(confidenceScore * 1000) / 1000,
      persistenceStatus,
      affiliateReadiness:
        affiliate.programConfigured ? "configured"
        : meta.partnershipTier === "research" ? "n/a"
        : "missing",
      challengeRate: Math.round(challengeRate * 1000) / 1000,
      activeQuotes,
      totalQuotes,
      productsWithQuotes,
      productionGaps,
      recommendedNextSteps,
    });
  }

  // Ensure core retailers appear even if not in registry
  for (const id of CORE_RETAILERS) {
    if (!retailers.some((r) => r.retailerId === id)) {
      retailers.push({
        retailerId: id,
        displayName: getRetailerMetadata(id).displayName,
        status: "blocked",
        works: false,
        acquisitionMethod: primaryAcquisitionMethod(id),
        confidenceScore: 0,
        persistenceStatus: "empty",
        affiliateReadiness: "missing",
        challengeRate: 0,
        activeQuotes: 0,
        totalQuotes: 0,
        productsWithQuotes: 0,
        productionGaps: ["Not registered in capability registry"],
        recommendedNextSteps: ["Add retailer to capability-registry.ts"],
      });
    }
  }

  retailers.sort((a, b) => {
    const order = { production_ready: 0, partial: 1, experimental: 2, blocked: 3 };
    return order[a.status] - order[b.status];
  });

  return {
    generatedAt: now.toISOString(),
    platformPositioning: [
      "Product comparison",
      "Shopping intelligence",
      "Recommendation engine",
      "Commerce discovery",
      "Pricing aggregation",
    ],
    retailers,
    orchestrationSummary,
    persistenceDiagnostics: {
      totalProducts,
      productsWithoutActiveQuotes: totalProducts - productsWithAnyQuote,
      expiredQuoteRatio: active + expired > 0 ? Math.round((expired / (active + expired)) * 1000) / 1000 : 0,
    },
  };
}

export function formatReadinessReportMarkdown(report: RetailerReadinessReport): string {
  const lines: string[] = [
    "# Retailer Readiness Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Platform positioning",
    ...report.platformPositioning.map((p) => `- ${p}`),
    "",
    "## Persistence",
    `- Products: ${report.persistenceDiagnostics.totalProducts}`,
    `- Products without active quotes: ${report.persistenceDiagnostics.productsWithoutActiveQuotes}`,
    `- Expired quote ratio: ${report.persistenceDiagnostics.expiredQuoteRatio}`,
    "",
    "## Retailers",
    "",
    "| Retailer | Status | Works | Method | Confidence | Persistence | Affiliate | Challenge | Active quotes |",
    "|----------|--------|-------|--------|------------|-------------|-----------|-----------|---------------|",
  ];

  for (const r of report.retailers) {
    lines.push(
      `| ${r.displayName} | ${r.status} | ${r.works ? "yes" : "no"} | ${r.acquisitionMethod} | ${r.confidenceScore} | ${r.persistenceStatus} | ${r.affiliateReadiness} | ${r.challengeRate} | ${r.activeQuotes} |`,
    );
  }

  lines.push("", "## Production gaps & next steps", "");
  for (const r of report.retailers) {
    if (!r.productionGaps.length) continue;
    lines.push(`### ${r.displayName}`, "");
    lines.push("**Gaps:**", ...r.productionGaps.map((g) => `- ${g}`), "");
    lines.push("**Next steps:**", ...r.recommendedNextSteps.map((s) => `- ${s}`), "");
  }

  lines.push(
    "",
    "## Orchestration metrics",
    `- Residential usage: ${(report.orchestrationSummary.residentialUsagePct * 100).toFixed(1)}%`,
    `- Avg cost per success: ${report.orchestrationSummary.avgCostPerSuccess}`,
    `- Fallback frequency: ${(report.orchestrationSummary.fallbackFrequency * 100).toFixed(1)}%`,
  );

  return lines.join("\n");
}
