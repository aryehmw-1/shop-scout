import { titleSimilarity } from "@/lib/demo-commerce/amazon-enrichment/similarity";
import type { CommerceIntelligenceGraph, RetailerOfferNode } from "../graph/types";

export interface ConfidenceBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  meanPredicted: number;
  meanActualProxy: number;
  miscalibration: number;
}

export interface OfferAnomaly {
  canonicalId: string;
  offerId: string;
  retailer: string;
  kind: "price_outlier" | "confidence_mismatch" | "stale_offer";
  message: string;
}

export interface IdentityDisagreement {
  canonicalId: string;
  title: string;
  overall: number;
  identifierAgreement: number;
  titleConsensus: number;
  message: string;
}

export interface FalsePositiveSignal {
  canonicalId: string;
  offerId: string;
  retailer: string;
  displayedConfidence: number;
  titleSimilarity: number;
  validationStatus: string;
  reason: string;
}

export interface CalibrationReport {
  evaluatedAt: string;
  offerCount: number;
  buckets: ConfidenceBucket[];
  /** 0–1 — higher means displayed confidence aligns with validation proxies */
  calibrationScore: number;
  identityDisagreements: IdentityDisagreement[];
  offerAnomalies: OfferAnomaly[];
  falsePositiveSignals: FalsePositiveSignal[];
  notes: string[];
}

const BUCKET_EDGES = [0, 0.35, 0.52, 0.72, 1.01];

function bucketLabel(min: number, max: number): string {
  return `${Math.round(min * 100)}–${Math.round(max * 100)}%`;
}

/** Proxy “ground truth” quality for an offer (deterministic, no human labels). */
function offerActualProxy(
  graph: CommerceIntelligenceGraph,
  offer: RetailerOfferNode,
): number {
  const titleSim = titleSimilarity(
    graph.canonical.title_normalized,
    offer.store_title,
  );
  const validated = offer.validation_status === "validated" ? 1 : 0;
  const linkBonus = offer.link_type === "pdp" ? 0.1 : 0;
  const fresh =
    offer.freshness_tier === "fresh" ? 0.1
    : offer.freshness_tier === "aging" ? 0.05
    : 0;
  return Math.min(1, titleSim * 0.55 + validated * 0.35 + linkBonus + fresh);
}

function detectOfferAnomalies(
  graph: CommerceIntelligenceGraph,
): OfferAnomaly[] {
  const anomalies: OfferAnomaly[] = [];
  const validated = graph.offers.filter((o) => o.validation_status === "validated");
  const prices = validated.map((o) => o.price).filter((p) => p > 0);
  if (prices.length < 2) return anomalies;

  const median = [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)]!;

  for (const o of validated) {
    const conf = o.confidence?.overall ?? 0;
    const titleSim = titleSimilarity(graph.canonical.title_normalized, o.store_title);

    if (median > 0 && Math.abs(o.price - median) / median > 0.4) {
      anomalies.push({
        canonicalId: graph.canonical.canonical_id,
        offerId: o.offer_id,
        retailer: o.retailer_name,
        kind: "price_outlier",
        message: `Price $${o.price.toFixed(2)} deviates >40% from median $${median.toFixed(2)}`,
      });
    }

    if (conf >= 0.65 && titleSim < 0.35) {
      anomalies.push({
        canonicalId: graph.canonical.canonical_id,
        offerId: o.offer_id,
        retailer: o.retailer_name,
        kind: "confidence_mismatch",
        message: `High offer confidence (${Math.round(conf * 100)}%) but weak title match (${Math.round(titleSim * 100)}%)`,
      });
    }

    if (o.freshness_tier === "stale" || o.freshness_tier === "expired") {
      anomalies.push({
        canonicalId: graph.canonical.canonical_id,
        offerId: o.offer_id,
        retailer: o.retailer_name,
        kind: "stale_offer",
        message: `Offer freshness tier: ${o.freshness_tier}`,
      });
    }
  }

  return anomalies;
}

export function analyzeCalibration(graphs: CommerceIntelligenceGraph[]): CalibrationReport {
  const bucketRows: Array<{ predicted: number; actual: number }> = [];
  const identityDisagreements: IdentityDisagreement[] = [];
  const offerAnomalies: OfferAnomaly[] = [];
  const falsePositiveSignals: FalsePositiveSignal[] = [];
  const notes: string[] = [];

  for (const graph of graphs) {
    const id = graph.identity_confidence;
    if (id.overall >= 0.55 && id.identifier_agreement < 0.5) {
      identityDisagreements.push({
        canonicalId: graph.canonical.canonical_id,
        title: graph.canonical.title,
        overall: id.overall,
        identifierAgreement: id.identifier_agreement,
        titleConsensus: id.title_consensus,
        message:
          "Identity score is moderate/high but identifiers do not agree — surface uncertainty in UX.",
      });
    }

    if (id.overall >= 0.6 && id.title_consensus < 0.4) {
      identityDisagreements.push({
        canonicalId: graph.canonical.canonical_id,
        title: graph.canonical.title,
        overall: id.overall,
        identifierAgreement: id.identifier_agreement,
        titleConsensus: id.title_consensus,
        message: "Title consensus is weak across retailer listings — verify product match.",
      });
    }

    offerAnomalies.push(...detectOfferAnomalies(graph));

    for (const o of graph.offers) {
      const predicted = o.confidence?.overall ?? 0;
      const actual = offerActualProxy(graph, o);
      bucketRows.push({ predicted, actual });

      if (predicted >= 0.6 && o.validation_status !== "validated") {
        falsePositiveSignals.push({
          canonicalId: graph.canonical.canonical_id,
          offerId: o.offer_id,
          retailer: o.retailer_name,
          displayedConfidence: predicted,
          titleSimilarity: titleSimilarity(graph.canonical.title_normalized, o.store_title),
          validationStatus: o.validation_status,
          reason: "High displayed confidence but offer failed validation gate",
        });
      }
      if (predicted >= 0.55 && actual < 0.45) {
        falsePositiveSignals.push({
          canonicalId: graph.canonical.canonical_id,
          offerId: o.offer_id,
          retailer: o.retailer_name,
          displayedConfidence: predicted,
          titleSimilarity: titleSimilarity(graph.canonical.title_normalized, o.store_title),
          validationStatus: o.validation_status,
          reason: "Confidence exceeds validation proxy — consider lowering weight",
        });
      }
    }
  }

  const buckets: ConfidenceBucket[] = [];
  for (let i = 0; i < BUCKET_EDGES.length - 1; i++) {
    const min = BUCKET_EDGES[i]!;
    const max = BUCKET_EDGES[i + 1]!;
    const inBucket = bucketRows.filter((r) => r.predicted >= min && r.predicted < max);
    const count = inBucket.length;
    const meanPredicted =
      count ? inBucket.reduce((s, r) => s + r.predicted, 0) / count : 0;
    const meanActualProxy =
      count ? inBucket.reduce((s, r) => s + r.actual, 0) / count : 0;
    buckets.push({
      label: bucketLabel(min, max === 1.01 ? 1 : max),
      min,
      max: max === 1.01 ? 1 : max,
      count,
      meanPredicted,
      meanActualProxy,
      miscalibration: Math.abs(meanPredicted - meanActualProxy),
    });
  }

  const populated = buckets.filter((b) => b.count > 0);
  const calibrationScore =
    populated.length ?
      Math.max(
        0,
        1 -
          populated.reduce((s, b) => s + b.miscalibration, 0) / populated.length,
      )
    : 0;

  if (falsePositiveSignals.length > 0) {
    notes.push(
      `${falsePositiveSignals.length} potential confidence false positive(s) — review offer scoring weights.`,
    );
  }
  if (identityDisagreements.length > 0) {
    notes.push(
      `${identityDisagreements.length} identity disagreement diagnostic(s) — ensure uncertainty banners fire.`,
    );
  }
  const overconfident = populated.filter(
    (b) => b.min >= 0.52 && b.meanPredicted - b.meanActualProxy > 0.15,
  );
  if (overconfident.length) {
    notes.push(
      `Overconfidence in bucket(s): ${overconfident.map((b) => b.label).join(", ")}`,
    );
  }

  return {
    evaluatedAt: new Date().toISOString(),
    offerCount: bucketRows.length,
    buckets,
    calibrationScore: Math.round(calibrationScore * 1000) / 1000,
    identityDisagreements,
    offerAnomalies,
    falsePositiveSignals,
    notes,
  };
}
