/**
 * Per-retailer acquisition capability registry — methods, health, confidence.
 */
import type { RetailerId } from "../../types";
import type { AcquisitionMethod, AcquisitionMethodConfig, RetailerCapability } from "./types";
import { strategyEffectiveness } from "../health/strategy-metrics";

const REGISTRY: Partial<Record<RetailerId, RetailerCapability>> = {
  amazon: {
    retailerId: "amazon",
    defaultMethod: "official_api",
    lastUpdated: new Date().toISOString(),
    extractionConfidence: 0.92,
    freshnessGuaranteeMs: 3600_000,
    methods: [
      { method: "official_api", enabled: true, costScore: 0.1, reliabilityScore: 0.95, notes: "PA-API golden path" },
      { method: "affiliate_feed", enabled: true, costScore: 0.15, reliabilityScore: 0.9 },
      { method: "http_lightweight", enabled: true, costScore: 0.2, reliabilityScore: 0.75 },
      { method: "browser_rendered", enabled: true, costScore: 0.85, reliabilityScore: 0.8 },
      { method: "cached_structured", enabled: true, costScore: 0.05, reliabilityScore: 0.7, freshnessTtlMs: 86400_000 },
    ],
  },
  walmart: {
    retailerId: "walmart",
    defaultMethod: "cached_structured",
    lastUpdated: new Date().toISOString(),
    extractionConfidence: 0.45,
    challengeRate: 0.7,
    freshnessGuaranteeMs: 14_400_000,
    methods: [
      { method: "merchant_feed", enabled: false, costScore: 0.2, reliabilityScore: 0.5, notes: "Future feed integration" },
      { method: "public_structured", enabled: false, costScore: 0.25, reliabilityScore: 0.4 },
      { method: "cached_structured", enabled: true, costScore: 0.05, reliabilityScore: 0.65, freshnessTtlMs: 43_200_000 },
      { method: "http_lightweight", enabled: true, costScore: 0.3, reliabilityScore: 0.25 },
      {
        method: "browser_rendered",
        enabled: true,
        costScore: 0.9,
        reliabilityScore: 0.4,
        notes: "Experimental fallback only — research/observability tier",
      },
    ],
  },
  target: {
    retailerId: "target",
    defaultMethod: "cached_structured",
    lastUpdated: new Date().toISOString(),
    extractionConfidence: 0.55,
    challengeRate: 0.45,
    methods: [
      { method: "affiliate_feed", enabled: false, costScore: 0.15, reliabilityScore: 0.7, notes: "Target Partners feed pending" },
      { method: "cached_structured", enabled: true, costScore: 0.05, reliabilityScore: 0.6, freshnessTtlMs: 43_200_000 },
      { method: "http_lightweight", enabled: true, costScore: 0.3, reliabilityScore: 0.45 },
      { method: "browser_rendered", enabled: true, costScore: 0.75, reliabilityScore: 0.55, notes: "Datacenter-first escalation" },
    ],
  },
  kroger: {
    retailerId: "kroger",
    defaultMethod: "browser_rendered",
    lastUpdated: new Date().toISOString(),
    extractionConfidence: 0.25,
    challengeRate: 0.85,
    methods: [
      { method: "browser_rendered", enabled: true, costScore: 0.95, reliabilityScore: 0.35 },
      { method: "cached_structured", enabled: true, costScore: 0.05, reliabilityScore: 0.4, freshnessTtlMs: 86400_000 },
    ],
  },
  costco: {
    retailerId: "costco",
    defaultMethod: "browser_rendered",
    lastUpdated: new Date().toISOString(),
    extractionConfidence: 0.2,
    challengeRate: 0.9,
    methods: [
      { method: "browser_rendered", enabled: true, costScore: 0.95, reliabilityScore: 0.25 },
    ],
  },
};

export function getRetailerCapability(retailerId: RetailerId): RetailerCapability {
  return (
    REGISTRY[retailerId] ?? {
      retailerId,
      defaultMethod: "http_lightweight",
      lastUpdated: new Date().toISOString(),
      methods: [
        { method: "http_lightweight", enabled: true, costScore: 0.3, reliabilityScore: 0.5 },
        { method: "browser_rendered", enabled: true, costScore: 0.9, reliabilityScore: 0.4 },
      ],
    }
  );
}

export function listRetailerCapabilities(): RetailerCapability[] {
  return Object.values(REGISTRY).filter(Boolean) as RetailerCapability[];
}

/** Order methods by composite score: reliability / cost (higher first). */
export function orderMethodsByEfficiency(
  cap: RetailerCapability,
  maxCostScore = 1,
): AcquisitionMethodConfig[] {
  return cap.methods
    .filter((m) => m.enabled && m.costScore <= maxCostScore)
    .sort((a, b) => b.reliabilityScore / b.costScore - a.reliabilityScore / a.costScore);
}

/** Merge live strategy metrics into capability challenge rates where available. */
export function enrichCapabilityWithMetrics(cap: RetailerCapability): RetailerCapability {
  const rows = strategyEffectiveness().filter((r) => r.retailerId === cap.retailerId);
  if (!rows.length) return cap;
  const blocks = rows.reduce((s, r) => s + r.blockRate * r.attempts, 0);
  const attempts = rows.reduce((s, r) => s + r.attempts, 0);
  const challengeRate = attempts ? Math.round((blocks / attempts) * 1000) / 1000 : cap.challengeRate;
  const successRate = attempts
    ? rows.reduce((s, r) => s + r.successRate * r.attempts, 0) / attempts
    : cap.extractionConfidence;
  return {
    ...cap,
    challengeRate,
    extractionConfidence: successRate,
    lastUpdated: new Date().toISOString(),
  };
}

export function listSupportedMethods(retailerId: RetailerId): AcquisitionMethod[] {
  return getRetailerCapability(retailerId)
    .methods.filter((m) => m.enabled)
    .map((m) => m.method);
}
