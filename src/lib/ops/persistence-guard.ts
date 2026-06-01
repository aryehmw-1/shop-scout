/**
 * Guards against accidental production data loss from purge/cleanup scripts.
 */
export interface PurgeGuardOptions {
  operation: string;
  dryRun?: boolean;
  confirm?: boolean;
  estimatedRows?: number;
}

export class PersistenceGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceGuardError";
  }
}

export function assertSafeToPurge(options: PurgeGuardOptions): void {
  const isProduction = process.env.NODE_ENV === "production";
  const force = process.env.ALLOW_DESTRUCTIVE_DB_OPS === "1";

  if (options.dryRun) return;

  if (isProduction && !force && !options.confirm) {
    throw new PersistenceGuardError(
      `[${options.operation}] blocked in production. Pass --confirm and set ALLOW_DESTRUCTIVE_DB_OPS=1 if intentional.`,
    );
  }

  if (!options.confirm && !force) {
    throw new PersistenceGuardError(
      `[${options.operation}] requires --confirm (estimated ${options.estimatedRows ?? "?"} rows). Use --dry-run to preview.`,
    );
  }
}

export function logCleanupAction(input: {
  action: string;
  rowsAffected: number;
  dryRun: boolean;
  source?: string;
}): void {
  const ts = new Date().toISOString();
  console.log(
    `[cleanup ${ts}] action=${input.action} dryRun=${input.dryRun} rows=${input.rowsAffected}${input.source ? ` source=${input.source}` : ""}`,
  );
}

/** Known destructive operations for observability dashboards. */
export const DESTRUCTIVE_OPERATIONS = [
  "purge-estimate-quotes",
  "purge-expired-quotes",
  "clear-nightly-quotes",
  "purge-absurd-scraped",
] as const;

export type DestructiveOperation = (typeof DESTRUCTIVE_OPERATIONS)[number];

export const DATA_LOSS_CAUSES = [
  {
    id: "quote_ttl_expiry",
    severity: "medium",
    description: "Hard DB expiry passed — mitigated by tiered freshness (7d visible window).",
    mitigation: "Quotes remain consumer-visible up to stale_visible tier; run proactive refresh.",
  },
  {
    id: "consumer_trust_gates",
    severity: "medium",
    description: "prepareResultsForDisplay filters offers below confidence/image/link gates.",
    mitigation: "Check /api/debug/platform-health trust gate stats; improve match confidence.",
  },
  {
    id: "purge_estimates_no_confirm",
    severity: "high",
    description: "db:purge-estimates deleted broad quote sources without dry-run guard.",
    mitigation: "Use --dry-run first; --confirm required; blocked in production by default.",
  },
  {
    id: "nightly_reindex_delete",
    severity: "low",
    description: "Nightly index deleteMany per product before recreate — brief gap if index fails mid-run.",
    mitigation: "partialRetailers mode; monitor index telemetry; do not run full purge during peak.",
  },
  {
    id: "missing_product_row",
    severity: "medium",
    description: "persistPriceQuotes silently skips when Product row missing for catalogId.",
    mitigation: "Ensure catalog sync before scrape persist; surface in platform-health.",
  },
  {
    id: "progressive_search_fast_only",
    severity: "low",
    description: "Initial fastOnly search may show empty until /api/search/enrich completes.",
    mitigation: "UI loading state; enrich timeout observability.",
  },
] as const;
