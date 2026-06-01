/**
 * Retailer health monitoring — tracks adapter reliability and surfaces degradation.
 */

import type { RetailerId } from "../../types";
import { getRetailerIntelligenceProfile } from "../intelligence/registry";
import { getBandwidthMetrics } from "./bandwidth-metrics";

export type RetailerHealthStatus = "healthy" | "degraded" | "failing" | "unknown";

export interface RetailerHealthSnapshot {
  retailerId: RetailerId;
  status: RetailerHealthStatus;
  trustScore: number;
  fetchSuccessRate: number;
  parserSuccessRate: number;
  lastFailureReason?: string;
  proxyRequired: boolean;
  recommendedAction?: string;
  bandwidthBytes?: number;
  bandwidthRequests?: number;
  proxyRequestPct?: number;
}

const memory: Map<
  RetailerId,
  { attempts: number; successes: number; parserOk: number; parserAttempts: number; lastError?: string }
> = new Map();

export function recordRetailerFetchOutcome(
  retailerId: RetailerId,
  ok: boolean,
  parserOk?: boolean,
  error?: string,
): void {
  const row = memory.get(retailerId) ?? {
    attempts: 0,
    successes: 0,
    parserOk: 0,
    parserAttempts: 0,
  };
  row.attempts += 1;
  if (ok) row.successes += 1;
  else if (error) row.lastError = error;
  if (parserOk != null) {
    row.parserAttempts += 1;
    if (parserOk) row.parserOk += 1;
  }
  memory.set(retailerId, row);
}

export function getRetailerHealthSnapshot(retailerId: RetailerId): RetailerHealthSnapshot {
  const profile = getRetailerIntelligenceProfile(retailerId);
  const row = memory.get(retailerId);
  const fetchSuccessRate =
    row && row.attempts > 0 ? row.successes / row.attempts : profile?.trustPrior ?? 0.5;
  const parserSuccessRate =
    row && row.parserAttempts > 0 ? row.parserOk / row.parserAttempts : fetchSuccessRate;

  let status: RetailerHealthStatus = "unknown";
  if (row && row.attempts >= 3) {
    if (fetchSuccessRate >= 0.65 && parserSuccessRate >= 0.55) status = "healthy";
    else if (fetchSuccessRate >= 0.35) status = "degraded";
    else status = "failing";
  }

  let recommendedAction: string | undefined;
  if (status === "failing" && profile?.capabilities.proxyRequired) {
    recommendedAction = "Check INDEX_PROXY_LIST — residential proxy required";
  } else if (status === "degraded") {
    recommendedAction = "Retry with alternate extraction strategy or refresh index";
  }
  const bandwidth = getBandwidthMetrics(retailerId);

  return {
    retailerId,
    status,
    trustScore: profile?.trustPrior ?? 0.5,
    fetchSuccessRate,
    parserSuccessRate,
    lastFailureReason: row?.lastError,
    proxyRequired: profile?.capabilities.proxyRequired ?? false,
    recommendedAction,
    bandwidthBytes: bandwidth?.bytes,
    bandwidthRequests: bandwidth?.requests,
    proxyRequestPct:
      bandwidth && bandwidth.requests > 0 ?
        Math.round((bandwidth.proxyRequests / bandwidth.requests) * 100)
      : undefined,
  };
}

export function listRetailerHealthSnapshots(): RetailerHealthSnapshot[] {
  const ids: RetailerId[] = ["walmart", "target", "amazon", "kroger", "costco", "aldi"];
  return ids.map(getRetailerHealthSnapshot);
}

export function prioritizeRetailersByHealth(retailerIds: RetailerId[]): RetailerId[] {
  return [...retailerIds].sort((a, b) => {
    const ha = getRetailerHealthSnapshot(a);
    const hb = getRetailerHealthSnapshot(b);
    const score = (h: RetailerHealthSnapshot) =>
      (h.status === "healthy" ? 3 : h.status === "degraded" ? 2 : h.status === "unknown" ? 1 : 0) +
      h.fetchSuccessRate;
    return score(hb) - score(ha);
  });
}
