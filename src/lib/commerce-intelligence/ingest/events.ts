/** Deterministic ingest lifecycle hooks (observability + audit). */
export type IngestEventType =
  | "ingest_started"
  | "ingest_completed"
  | "row_parsed"
  | "offer_upserted"
  | "canonical_created"
  | "canonical_merged"
  | "row_rejected"
  | "orphan_row";

export interface IngestEvent {
  type: IngestEventType;
  at: string;
  source: string;
  payload: Record<string, unknown>;
}

export interface IngestRunReport {
  run_id: string;
  source: string;
  started_at: string;
  completed_at: string;
  rows_read: number;
  offers_upserted: number;
  canonicals_created: number;
  canonicals_updated: number;
  rows_rejected: number;
  orphans: number;
  match_stats: {
    by_gtin: number;
    by_asin: number;
    by_title: number;
    new_canonical: number;
  };
  rejection_reasons: Record<string, number>;
  events: IngestEvent[];
}

export function createIngestReport(runId: string, source: string): IngestRunReport {
  return {
    run_id: runId,
    source,
    started_at: new Date().toISOString(),
    completed_at: "",
    rows_read: 0,
    offers_upserted: 0,
    canonicals_created: 0,
    canonicals_updated: 0,
    rows_rejected: 0,
    orphans: 0,
    match_stats: { by_gtin: 0, by_asin: 0, by_title: 0, new_canonical: 0 },
    rejection_reasons: {},
    events: [],
  };
}

export function recordRejection(report: IngestRunReport, reason: string): void {
  report.rows_rejected++;
  report.rejection_reasons[reason] = (report.rejection_reasons[reason] ?? 0) + 1;
  report.events.push({
    type: "row_rejected",
    at: new Date().toISOString(),
    source: report.source,
    payload: { reason },
  });
}
