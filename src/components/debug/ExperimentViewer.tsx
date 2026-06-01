"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface BatchSummary {
  batchId: string;
  retailerId: string;
  presetId?: string;
  startedAt: string;
  completedAt: string;
  cellCount: number;
  challengeFrequency: number;
}

interface ExperimentApiResponse {
  batches: BatchSummary[];
  presets: Array<{ id: string; label: string; retailerId: string }>;
  capabilities: unknown[];
  acquisitionPlan: unknown;
  batch?: ExperimentBatchDetail;
}

interface ExperimentBatchDetail {
  batchId: string;
  retailerId: string;
  comparison: {
    challengeFrequency: number;
    featureImportance: Array<{
      factor: string;
      level: string;
      challengeRate: number;
      deltaFromBaseline: number;
      samples: number;
    }>;
    fingerprintDiffs: Array<{ field: string; delta?: string; baseline?: unknown; challenged?: unknown }>;
  };
  cells: Array<{
    cell: { id: string; label: string; factor: string; factorValue: string; isBaseline?: boolean };
    sessionScore: {
      failureKind: string;
      challenged: boolean;
      extractionConfidence: number;
    };
    analytics: {
      challengeType: string;
      vendor?: string;
      reason: string;
      domCompleteness: number;
      redirectChain: Array<{ url: string; status: number }>;
      pxNetworkCalls: string[];
      failedRequests: Array<{ url: string; failure?: string }>;
      telemetryFailures: string[];
    };
    fetch: {
      artifactDir?: string | null;
      lifecycle?: { stages: Array<{ stage: string; atMs: number; note?: string }> };
    };
    durationMs: number;
  }>;
  sharedIdentity?: { ip?: string; country?: string; ok?: boolean };
}

export function ExperimentViewer({ initialBatchId }: { initialBatchId?: string }) {
  const [batchId, setBatchId] = useState(initialBatchId ?? "");
  const [data, setData] = useState<ExperimentApiResponse | null>(null);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id?: string) => {
    setLoading(true);
    setError(null);
    try {
      const q = id ? `?batch=${encodeURIComponent(id)}` : "";
      const res = await fetch(`/api/debug/experiments${q}`);
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as ExperimentApiResponse;
      setData(json);
      if (json.batch?.cells.length && !selectedCell) {
        setSelectedCell(json.batch.cells[0]!.cell.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [selectedCell]);

  useEffect(() => {
    void load(batchId || undefined);
  }, [batchId, load]);

  const batch = data?.batch;
  const cell = batch?.cells.find((c) => c.cell.id === selectedCell);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-stone-500">Batch ID</label>
          <select
            className="mt-1 block w-full min-w-[280px] rounded-xl border border-stone-200 px-3 py-2 text-sm"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            <option value="">Latest list</option>
            {(data?.batches ?? []).map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.batchId.slice(0, 19)} — {b.retailerId} ({Math.round(b.challengeFrequency * 100)}% challenged)
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load(batchId || undefined)}
          disabled={loading}
          className="rounded-xl bg-sage-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sage-700 disabled:opacity-60"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {!batch && data?.batches.length ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="font-semibold text-stone-900">Recent experiment batches</h2>
          <p className="mt-1 text-sm text-stone-600">Select a batch above to inspect cells, timelines, and diffs.</p>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b text-stone-500">
                <th className="py-2">Batch</th>
                <th>Retailer</th>
                <th>Cells</th>
                <th>Challenge rate</th>
              </tr>
            </thead>
            <tbody>
              {data.batches.map((b) => (
                <tr key={b.batchId} className="border-b border-stone-100">
                  <td className="py-2 font-mono text-xs">{b.batchId}</td>
                  <td>{b.retailerId}</td>
                  <td>{b.cellCount}</td>
                  <td>{Math.round(b.challengeFrequency * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {batch && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Challenge frequency" value={`${Math.round(batch.comparison.challengeFrequency * 100)}%`} />
            <Stat
              label="Shared identity"
              value={batch.sharedIdentity?.ok ? `${batch.sharedIdentity.country} / ${batch.sharedIdentity.ip?.slice(0, 12)}…` : "probe failed"}
            />
            <Stat label="Cells" value={String(batch.cells.length)} />
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <h2 className="font-semibold text-stone-900">Feature importance</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="text-stone-500">
                  <th className="py-1">Factor</th>
                  <th>Level</th>
                  <th>Challenge rate</th>
                  <th>Δ baseline</th>
                </tr>
              </thead>
              <tbody>
                {batch.comparison.featureImportance.map((r) => (
                  <tr key={`${r.factor}-${r.level}`} className="border-t border-stone-100">
                    <td className="py-1">{r.factor}</td>
                    <td>{r.level}</td>
                    <td>{Math.round(r.challengeRate * 100)}%</td>
                    <td className={r.deltaFromBaseline > 0 ? "text-red-700" : "text-green-700"}>
                      {r.deltaFromBaseline > 0 ? "+" : ""}
                      {Math.round(r.deltaFromBaseline * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-white p-4 lg:col-span-1">
              <h2 className="font-semibold text-stone-900">Cells</h2>
              <ul className="mt-2 space-y-1">
                {batch.cells.map((c) => (
                  <li key={c.cell.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedCell(c.cell.id)}
                      className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                        selectedCell === c.cell.id ? "bg-sage-100 text-sage-900" : "hover:bg-stone-50"
                      }`}
                    >
                      <span className="font-medium">{c.cell.label}</span>
                      <span className="ml-2 text-xs text-stone-500">{c.sessionScore.failureKind}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {cell && (
              <div className="space-y-4 lg:col-span-2">
                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                  <h2 className="font-semibold text-stone-900">{cell.cell.label}</h2>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <Item k="Challenge" v={`${cell.analytics.challengeType} / ${cell.analytics.reason}`} />
                    <Item k="Vendor" v={cell.analytics.vendor ?? "—"} />
                    <Item k="Failure kind" v={cell.sessionScore.failureKind} />
                    <Item k="DOM completeness" v={`${Math.round(cell.analytics.domCompleteness * 100)}%`} />
                    <Item k="Confidence" v={String(cell.sessionScore.extractionConfidence)} />
                    <Item k="Duration" v={`${cell.durationMs}ms`} />
                  </dl>
                </div>

                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                  <h3 className="font-medium text-stone-900">Session timeline</h3>
                  <ol className="mt-2 max-h-48 overflow-auto text-xs font-mono">
                    {(cell.fetch.lifecycle?.stages ?? []).map((s, i) => (
                      <li key={i} className="border-b border-stone-100 py-1">
                        <span className="text-stone-400">{s.atMs}ms</span> {s.stage}
                        {s.note ? <span className="text-stone-500"> — {s.note}</span> : null}
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                  <h3 className="font-medium text-stone-900">Redirect chain</h3>
                  <ul className="mt-2 text-xs">
                    {cell.analytics.redirectChain.map((r, i) => (
                      <li key={i} className="truncate py-0.5">
                        {r.status} {r.url}
                      </li>
                    ))}
                  </ul>
                </div>

                {(cell.analytics.pxNetworkCalls.length > 0 || cell.analytics.failedRequests.length > 0) && (
                  <div className="rounded-2xl border border-stone-200 bg-white p-4">
                    <h3 className="font-medium text-stone-900">Network (PX / failures)</h3>
                    {cell.analytics.pxNetworkCalls.length > 0 && (
                      <>
                        <p className="mt-2 text-xs font-semibold text-stone-500">PerimeterX calls</p>
                        <ul className="text-xs">
                          {cell.analytics.pxNetworkCalls.map((u, i) => (
                            <li key={i} className="truncate py-0.5">{u}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {cell.analytics.failedRequests.length > 0 && (
                      <>
                        <p className="mt-2 text-xs font-semibold text-stone-500">Failed requests</p>
                        <ul className="text-xs">
                          {cell.analytics.failedRequests.slice(0, 15).map((r, i) => (
                            <li key={i} className="truncate py-0.5">
                              {r.failure}: {r.url}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}

                {cell.fetch.artifactDir && (
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm">
                    <h3 className="font-medium text-stone-900">Artifacts</h3>
                    <p className="mt-1 break-all font-mono text-xs text-stone-600">{cell.fetch.artifactDir}</p>
                    <p className="mt-2 text-xs text-stone-500">
                      Contains challenge.png, page.html, network.har, meta.json from extraction vault.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {batch.comparison.fingerprintDiffs.length > 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <h2 className="font-semibold text-stone-900">Fingerprint diff (success vs challenged)</h2>
              <table className="mt-2 w-full text-left text-sm">
                <thead>
                  <tr className="text-stone-500">
                    <th>Field</th>
                    <th>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.comparison.fingerprintDiffs.map((d) => (
                    <tr key={d.field} className="border-t border-stone-100">
                      <td className="py-1 font-mono text-xs">{d.field}</td>
                      <td className="py-1 text-xs">{d.delta ?? JSON.stringify(d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-stone-500">{k}</dt>
      <dd className="font-medium text-stone-900">{v}</dd>
    </div>
  );
}
