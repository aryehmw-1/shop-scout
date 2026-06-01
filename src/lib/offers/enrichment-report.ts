import type { CatalogItem } from "../retailers/catalog";
import type { AcquisitionFailureClass } from "../retailers/acquisition/failure-classification";
import type { ProductOffer, RetailerId } from "../types";
import type { AmazonMatchMetrics } from "./amazon-validation";
import type { PersistValidationResult } from "./offer-persist-validation";
import type { RetailerEnrichmentStatus } from "./retailer-enrichment-status";

export interface RetailerEnrichmentAttempt {
  retailer: RetailerId;
  status: RetailerEnrichmentStatus;
  fetchMs?: number;
  fetchOk: boolean;
  fetchReason?: string;
  parserSuccess: boolean;
  adapterConfidence?: number;
  rejectionReason?: string;
  price?: number;
  pdpUrl?: string;
  hasImage?: boolean;
  resolvedVia?: string;
  failureClass?: AcquisitionFailureClass;
}

export interface EnrichmentReportOffer {
  retailer: RetailerId;
  price?: number;
  matchConfidence?: number;
  pdpUrl?: string;
  priceSource?: string;
  status: RetailerEnrichmentStatus | "persisted" | "display";
}

export interface RejectedEnrichmentOffer {
  retailer: RetailerId;
  reason: string;
  status: RetailerEnrichmentStatus | "persist_rejected" | "display_rejected";
  detail?: string;
}

export interface ProductEnrichmentReport {
  catalogId: string;
  phase: "index" | "search";
  startedAt: string;
  elapsedMs: number;
  attempts: RetailerEnrichmentAttempt[];
  acceptedOffers: EnrichmentReportOffer[];
  rejectedOffers: RejectedEnrichmentOffer[];
  amazon?: AmazonMatchMetrics;
  metrics: {
    retailersAttempted: number;
    fetchOk: number;
    fetchFailed: number;
    parserSuccess: number;
    parserFailed: number;
    persisted: number;
    displayable: number;
    rejected: number;
  };
}

export function createEnrichmentReport(
  catalogId: string,
  phase: "index" | "search",
): ProductEnrichmentReport {
  return {
    catalogId,
    phase,
    startedAt: new Date().toISOString(),
    elapsedMs: 0,
    attempts: [],
    acceptedOffers: [],
    rejectedOffers: [],
    metrics: {
      retailersAttempted: 0,
      fetchOk: 0,
      fetchFailed: 0,
      parserSuccess: 0,
      parserFailed: 0,
      persisted: 0,
      displayable: 0,
      rejected: 0,
    },
  };
}

export function recordEnrichmentAttempt(
  report: ProductEnrichmentReport,
  attempt: RetailerEnrichmentAttempt,
): void {
  report.attempts.push(attempt);
  report.metrics.retailersAttempted += 1;
  if (attempt.fetchOk) report.metrics.fetchOk += 1;
  else report.metrics.fetchFailed += 1;
  if (attempt.parserSuccess) report.metrics.parserSuccess += 1;
  else report.metrics.parserFailed += 1;
}

export function recordPersistRejections(
  report: ProductEnrichmentReport,
  rejected: Array<{ offer: ProductOffer; result: PersistValidationResult }>,
): void {
  for (const { offer, result } of rejected) {
    report.rejectedOffers.push({
      retailer: offer.retailer,
      reason: result.reason ?? "unknown",
      status: "persist_rejected",
      detail: result.detail,
    });
    report.metrics.rejected += 1;
  }
}

export function finalizeEnrichmentReport(
  report: ProductEnrichmentReport,
  accepted: ProductOffer[],
  displayable: ProductOffer[],
  startedMs: number,
): ProductEnrichmentReport {
  report.elapsedMs = Date.now() - startedMs;
  report.acceptedOffers = accepted.map((o) => ({
    retailer: o.retailer,
    price: o.price,
    matchConfidence: o.matchConfidence,
    pdpUrl: o.productUrl,
    priceSource: o.priceSource,
    status: "persisted",
  }));
  report.metrics.persisted = accepted.length;
  report.metrics.displayable = displayable.length;
  return report;
}

export function enrichmentReportEnabled(): boolean {
  const raw = process.env.INDEX_ENRICHMENT_REPORT?.trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return false;
  return (
    raw === "1" ||
    raw === "true" ||
    raw === "on" ||
    process.env.PIPELINE_DEBUG === "1" ||
    process.env.INDEX_OFFER_DIAGNOSTICS === "1"
  );
}

export function logEnrichmentReport(
  report: ProductEnrichmentReport,
  item?: CatalogItem,
): void {
  if (!enrichmentReportEnabled()) return;

  console.log(`[enrichment-report:${report.phase}]`, report.catalogId, {
    elapsedMs: report.elapsedMs,
    metrics: report.metrics,
    amazon: report.amazon ?
      {
        accepted: report.amazon.accepted,
        asin: report.amazon.asin,
        matchScore: report.amazon.matchScore,
        why: report.amazon.matchReasons.join(" · "),
      }
    : undefined,
    selected: report.acceptedOffers.map((o) => ({
      retailer: o.retailer,
      price: o.price,
      pdp: o.pdpUrl?.slice(0, 60),
      conf: o.matchConfidence,
    })),
    rejected: report.rejectedOffers.slice(0, 20),
    attempts: report.attempts.map((a) => ({
      retailer: a.retailer,
      status: a.status,
      failureClass: a.failureClass,
      fetchMs: a.fetchMs,
      parserSuccess: a.parserSuccess,
      conf: a.adapterConfidence,
      reason: a.rejectionReason ?? a.fetchReason,
    })),
    product: item ? { title: item.title, category: item.category, base: item.basePrice } : undefined,
  });
}
