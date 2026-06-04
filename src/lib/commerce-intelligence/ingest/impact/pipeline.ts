import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadAllGraphs,
  loadGraph,
  recomputeAndSaveGraph,
  saveIngestReport,
  syncPublishedGraphsToDemoCatalog,
} from "../../graph/store";
import { createIngestReport, recordRejection, type IngestRunReport } from "../events";
import { parseImpactFeedText } from "./parse-feed";
import { resolveCanonicalForRow, upsertOfferOnGraph } from "./resolve-canonical";
import type { ImpactIngestOptions } from "./types";
import { fetchImpactCatalogText } from "./fetch-catalog";
import { createIngestDuplicateTracker, validateImpactRow } from "../row-validation";
import { cleanupStaleGraphData } from "../stale-cleanup";

export interface ImpactIngestResult {
  report: IngestRunReport;
  graphs_touched: number;
  published_synced: number;
}

export async function runImpactIngest(
  opts: ImpactIngestOptions = {},
): Promise<ImpactIngestResult> {
  const runId = createHash("sha256")
    .update(`${Date.now()}-${opts.filePath ?? opts.impactCatalogId ?? "api"}`)
    .digest("hex")
    .slice(0, 12);
  const report = createIngestReport(runId, "impact_feed");
  report.events.push({
    type: "ingest_started",
    at: report.started_at,
    source: report.source,
    payload: { dry_run: Boolean(opts.dryRun), file: opts.filePath },
  });

  const catalogId = opts.catalogId ?? opts.impactCatalogId ?? "impact-catalog";
  const advertiser = opts.advertiserSlug ?? "impact-advertiser";

  let text: string;
  if (opts.filePath) {
    text = readFileSync(resolve(process.cwd(), opts.filePath), "utf8");
  } else if (opts.useApi) {
    text = await fetchImpactCatalogText({
      catalogId: opts.impactCatalogId ?? catalogId,
    });
  } else {
    throw new Error("Impact ingest requires --file=path or --use-api with IMPACT credentials");
  }

  const rows = parseImpactFeedText(text, {
    catalogId,
    advertiserName: advertiser,
    maxRows: opts.maxRows ?? 5000,
  });
  report.rows_read = rows.length;

  let existingGraphs = loadAllGraphs();
  const touched = new Set<string>();
  const dupes = createIngestDuplicateTracker();

  for (const row of rows) {
    const validation = validateImpactRow(row);
    if (!validation.valid) {
      recordRejection(report, validation.reason ?? "row_invalid");
      report.orphans++;
      continue;
    }
    if (dupes.isDuplicate(row)) {
      recordRejection(report, "duplicate_row_in_batch");
      continue;
    }

    const resolved = resolveCanonicalForRow(row, report, existingGraphs);
    touched.add(resolved.canonical_id);

    if (opts.dryRun) continue;

    let graph =
      existingGraphs.find((g) => g.canonical.canonical_id === resolved.canonical_id) ??
      loadGraph(resolved.canonical_id);

    if (!graph) {
      recordRejection(report, "graph_missing_after_resolve");
      continue;
    }

    upsertOfferOnGraph(graph, row, report);
    graph = loadGraph(resolved.canonical_id);
    if (graph) {
      const idx = existingGraphs.findIndex(
        (g) => g.canonical.canonical_id === resolved.canonical_id,
      );
      if (idx >= 0) existingGraphs[idx] = graph;
      else existingGraphs.push(graph);
    }
  }

  let staleCleanup = null;
  if (!opts.dryRun) {
    for (const id of touched) {
      recomputeAndSaveGraph(id);
    }
    staleCleanup = cleanupStaleGraphData();
  }

  report.completed_at = new Date().toISOString();
  report.events.push({
    type: "ingest_completed",
    at: report.completed_at,
    source: report.source,
    payload: {
      touched: touched.size,
      orphan_rate: report.rows_read > 0 ? report.orphans / report.rows_read : 0,
      match_stats: report.match_stats,
      stale_cleanup: staleCleanup,
    },
  });

  saveIngestReport(report);

  let published_synced = 0;
  if (!opts.dryRun) {
    published_synced = syncPublishedGraphsToDemoCatalog().length;
    const { runIntelligenceMaintenance } = await import("../../ops/maintenance");
    runIntelligenceMaintenance("ingest");
  }

  return {
    report,
    graphs_touched: touched.size,
    published_synced,
  };
}
