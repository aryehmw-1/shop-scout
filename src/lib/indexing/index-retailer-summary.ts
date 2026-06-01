/**
 * Aggregates retailer fetch failures across an index run for operational diagnostics.
 */

import type { RetailerId } from "../types";
import type { AcquisitionFailureClass } from "../retailers/acquisition/failure-classification";
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
  failureClasses: Record<AcquisitionFailureClass, number>;
  fetchSuccessRate: number;
  parseSuccessRate: number;
}

export interface RetailerPersistStats {
  persisted: number;
  rejected: Record<string, number>;
  verifiedPersistenceRate: number;
  trustRejectionRate: number;
}

export interface IndexRetailerRunSummary {
  fetchByRetailer: RetailerFetchStats[];
  persistByRetailer: Record<string, RetailerPersistStats>;
  failureClasses: Record<AcquisitionFailureClass, number>;
  rates: {
    fetchSuccessRate: number;
    parseSuccessRate: number;
    verifiedPersistenceRate: number;
    trustRejectionRate: number;
  };
  normalizationFailures: number;
  proxyConfigured: boolean;
  proxyPoolSize: number;
}

const fetchStats = new Map<string, RetailerFetchStats>();
const persistStats = new Map<string, RetailerPersistStats>();
const globalFailureClasses: Record<AcquisitionFailureClass, number> = {
  success: 0,
  blocked: 0,
  empty_parse: 0,
  selector_mismatch: 0,
  anti_bot: 0,
  timeout: 0,
  partial_success: 0,
  no_price_extracted: 0,
};
let normalizationFailures = 0;

function emptyFailureClasses(): Record<AcquisitionFailureClass, number> {
  return {
    success: 0,
    blocked: 0,
    empty_parse: 0,
    selector_mismatch: 0,
    anti_bot: 0,
    timeout: 0,
    partial_success: 0,
    no_price_extracted: 0,
  };
}

function ensureFetchRow(retailerId: string): RetailerFetchStats {
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
      failureClasses: emptyFailureClasses(),
      fetchSuccessRate: 0,
      parseSuccessRate: 0,
    };
    fetchStats.set(retailerId, row);
  }
  return row;
}

function ensurePersistRow(retailerId: string): RetailerPersistStats {
  let row = persistStats.get(retailerId);
  if (!row) {
    row = {
      persisted: 0,
      rejected: {},
      verifiedPersistenceRate: 0,
      trustRejectionRate: 0,
    };
    persistStats.set(retailerId, row);
  }
  return row;
}

function recomputeFetchRates(row: RetailerFetchStats): void {
  row.fetchSuccessRate =
    row.attempts > 0 ? Math.round((row.successes / row.attempts) * 1000) / 1000 : 0;
  const parseAttempts = row.failureClasses.success + row.failureClasses.partial_success +
    row.failureClasses.no_price_extracted + row.failureClasses.empty_parse +
    row.failureClasses.selector_mismatch;
  const parseSuccesses =
    row.failureClasses.success + row.failureClasses.partial_success +
    row.failureClasses.no_price_extracted;
  row.parseSuccessRate =
    parseAttempts > 0 ?
      Math.round((parseSuccesses / parseAttempts) * 1000) / 1000
    : row.fetchSuccessRate;
}

function recomputePersistRates(row: RetailerPersistStats): void {
  const rejectedTotal = Object.values(row.rejected).reduce((a, b) => a + b, 0);
  const total = row.persisted + rejectedTotal;
  row.verifiedPersistenceRate =
    total > 0 ? Math.round((row.persisted / total) * 1000) / 1000 : 0;
  row.trustRejectionRate =
    total > 0 ? Math.round((rejectedTotal / total) * 1000) / 1000 : 0;
}

export function resetIndexRetailerSummary(): void {
  fetchStats.clear();
  persistStats.clear();
  normalizationFailures = 0;
  for (const key of Object.keys(globalFailureClasses) as AcquisitionFailureClass[]) {
    globalFailureClasses[key] = 0;
  }
}

export function recordFetchOutcome(
  failure: RetailerFetchFailure | null,
  retailerId: RetailerId,
  proxyUsed: boolean,
  failureClass?: AcquisitionFailureClass,
): void {
  const row = ensureFetchRow(retailerId);
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

  const cls = failureClass ?? (failure ? "blocked" : "success");
  row.failureClasses[cls] = (row.failureClasses[cls] ?? 0) + 1;
  globalFailureClasses[cls] = (globalFailureClasses[cls] ?? 0) + 1;
  recomputeFetchRates(row);
}

export function recordEnrichmentFailureClass(
  retailerId: RetailerId,
  failureClass: AcquisitionFailureClass,
): void {
  const row = ensureFetchRow(retailerId);
  row.failureClasses[failureClass] = (row.failureClasses[failureClass] ?? 0) + 1;
  globalFailureClasses[failureClass] = (globalFailureClasses[failureClass] ?? 0) + 1;
  recomputeFetchRates(row);
}

export function recordPersistOutcome(
  retailerId: string,
  accepted: boolean,
  reason?: string,
): void {
  const row = ensurePersistRow(retailerId);
  if (accepted) {
    row.persisted += 1;
  } else if (reason) {
    row.rejected[reason] = (row.rejected[reason] ?? 0) + 1;
  }
  recomputePersistRates(row);
}

export function recordNormalizationFailure(): void {
  normalizationFailures += 1;
}

function aggregateRates(): IndexRetailerRunSummary["rates"] {
  const fetchRows = [...fetchStats.values()];
  const persistRows = [...persistStats.values()];

  const fetchAttempts = fetchRows.reduce((a, r) => a + r.attempts, 0);
  const fetchSuccesses = fetchRows.reduce((a, r) => a + r.successes, 0);
  const persisted = persistRows.reduce((a, r) => a + r.persisted, 0);
  const rejected = persistRows.reduce(
    (a, r) => a + Object.values(r.rejected).reduce((x, y) => x + y, 0),
    0,
  );
  const parseSuccesses =
    globalFailureClasses.success +
    globalFailureClasses.partial_success +
    globalFailureClasses.no_price_extracted;
  const parseAttempts =
    parseSuccesses +
    globalFailureClasses.empty_parse +
    globalFailureClasses.selector_mismatch;

  return {
    fetchSuccessRate:
      fetchAttempts > 0 ?
        Math.round((fetchSuccesses / fetchAttempts) * 1000) / 1000
      : 0,
    parseSuccessRate:
      parseAttempts > 0 ?
        Math.round((parseSuccesses / parseAttempts) * 1000) / 1000
      : 0,
    verifiedPersistenceRate:
      persisted + rejected > 0 ?
        Math.round((persisted / (persisted + rejected)) * 1000) / 1000
      : 0,
    trustRejectionRate:
      persisted + rejected > 0 ?
        Math.round((rejected / (persisted + rejected)) * 1000) / 1000
      : 0,
  };
}

export function getIndexRetailerRunSummary(): IndexRetailerRunSummary {
  const pool = proxyUrlPool();
  return {
    fetchByRetailer: [...fetchStats.values()].sort((a, b) => b.attempts - a.attempts),
    persistByRetailer: Object.fromEntries(persistStats),
    failureClasses: { ...globalFailureClasses },
    rates: aggregateRates(),
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
    `Fetch success: **${(summary.rates.fetchSuccessRate * 100).toFixed(1)}%** · Parse success: **${(summary.rates.parseSuccessRate * 100).toFixed(1)}%** · Verified persist: **${(summary.rates.verifiedPersistenceRate * 100).toFixed(1)}%** · Trust rejection: **${(summary.rates.trustRejectionRate * 100).toFixed(1)}%**`,
    "",
    "### Failure classes",
    ...Object.entries(summary.failureClasses)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- **${k}**: ${v}`),
    "",
    "| Retailer | Attempts | OK | Fail | Fetch % | Parse % | Top failure reasons |",
    "|----------|--------:|---:|-----:|--------:|--------:|---------------------|",
  ];

  for (const r of summary.fetchByRetailer) {
    const topReasons = Object.entries(r.reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k, v]) => `${k}(${v})`)
      .join(", ");
    lines.push(
      `| ${r.retailerId} | ${r.attempts} | ${r.successes} | ${r.failures} | ${(r.fetchSuccessRate * 100).toFixed(0)}% | ${(r.parseSuccessRate * 100).toFixed(0)}% | ${topReasons || "—"} |`,
    );
  }

  lines.push("", "## Persist outcomes (trust gating)", "");
  for (const [retailer, stats] of Object.entries(summary.persistByRetailer)) {
    const rejects = Object.entries(stats.rejected)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    lines.push(
      `- **${retailer}**: persisted=${stats.persisted} (${(stats.verifiedPersistenceRate * 100).toFixed(0)}%)${rejects ? ` · rejected: ${rejects}` : ""}`,
    );
  }

  if (summary.normalizationFailures > 0) {
    lines.push("", `Amazon normalization rejections: ${summary.normalizationFailures}`);
  }

  return lines.join("\n");
}
