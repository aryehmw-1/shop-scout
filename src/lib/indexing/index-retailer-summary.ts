/**
 * Aggregates retailer fetch failures across an index run for operational diagnostics.
 */

import type { RetailerId } from "../types";
import type { RetailerFetchFailure } from "../offers/retailer-adapters/retailer-fetch";
import { proxyUrlPool } from "../offers/retailer-adapters/retailer-fetch";

export interface RetailerFetchStats {
  retailerId: string;
  attempts: number;
  successes: number;
  failures: number;
  proxyUsed: number;
  directOnly: number;
  reasons: Record<string, number>;
}

export interface IndexRetailerRunSummary {
  fetchByRetailer: RetailerFetchStats[];
  persistByRetailer: Record<string, { persisted: number; rejected: Record<string, number> }>;
  normalizationFailures: number;
  proxyConfigured: boolean;
  proxyPoolSize: number;
}

const fetchStats = new Map<string, RetailerFetchStats>();
const persistStats = new Map<string, { persisted: number; rejected: Record<string, number> }>();
let normalizationFailures = 0;

export function resetIndexRetailerSummary(): void {
  fetchStats.clear();
  persistStats.clear();
  normalizationFailures = 0;
}

export function recordFetchOutcome(
  failure: RetailerFetchFailure | null,
  retailerId: RetailerId,
  proxyUsed: boolean,
): void {
  let row = fetchStats.get(retailerId);
  if (!row) {
    row = {
      retailerId,
      attempts: 0,
      successes: 0,
      failures: 0,
      proxyUsed: 0,
      directOnly: 0,
      reasons: {},
    };
    fetchStats.set(retailerId, row);
  }
  row.attempts += 1;
  if (failure) {
    row.failures += 1;
    row.reasons[failure.reason] = (row.reasons[failure.reason] ?? 0) + 1;
    if (failure.proxyUsed) row.proxyUsed += 1;
    else row.directOnly += 1;
  } else {
    row.successes += 1;
    if (proxyUsed) row.proxyUsed += 1;
    else row.directOnly += 1;
  }
}

export function recordPersistOutcome(
  retailerId: string,
  accepted: boolean,
  reason?: string,
): void {
  let row = persistStats.get(retailerId);
  if (!row) {
    row = { persisted: 0, rejected: {} };
    persistStats.set(retailerId, row);
  }
  if (accepted) {
    row.persisted += 1;
  } else if (reason) {
    row.rejected[reason] = (row.rejected[reason] ?? 0) + 1;
  }
}

export function recordNormalizationFailure(): void {
  normalizationFailures += 1;
}

export function getIndexRetailerRunSummary(): IndexRetailerRunSummary {
  const pool = proxyUrlPool();
  return {
    fetchByRetailer: [...fetchStats.values()].sort((a, b) => b.attempts - a.attempts),
    persistByRetailer: Object.fromEntries(persistStats),
    normalizationFailures,
    proxyConfigured: pool.length > 0,
    proxyPoolSize: pool.length,
  };
}

export function formatIndexRetailerSummaryMarkdown(summary: IndexRetailerRunSummary): string {
  const lines = [
    "## Retailer fetch diagnostics",
    "",
    `Proxy configured: **${summary.proxyConfigured ? `yes (${summary.proxyPoolSize} URLs)` : "NO — Walmart/Target/Kroger will fail without INDEX_PROXY_LIST"}**`,
    "",
    "| Retailer | Attempts | OK | Fail | Proxy used | Top failure reasons |",
    "|----------|--------:|---:|-----:|-----------:|---------------------|",
  ];

  for (const r of summary.fetchByRetailer) {
    const topReasons = Object.entries(r.reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k, v]) => `${k}(${v})`)
      .join(", ");
    lines.push(
      `| ${r.retailerId} | ${r.attempts} | ${r.successes} | ${r.failures} | ${r.proxyUsed} | ${topReasons || "—"} |`,
    );
  }

  lines.push("", "## Persist outcomes", "");
  for (const [retailer, stats] of Object.entries(summary.persistByRetailer)) {
    const rejects = Object.entries(stats.rejected)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    lines.push(`- **${retailer}**: persisted=${stats.persisted}${rejects ? ` · rejected: ${rejects}` : ""}`);
  }

  if (summary.normalizationFailures > 0) {
    lines.push("", `Amazon normalization rejections: ${summary.normalizationFailures}`);
  }

  return lines.join("\n");
}
