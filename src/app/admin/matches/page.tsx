"use client";

import { useEffect, useState, useCallback } from "react";

interface Row {
  id: string;
  titleA: string;
  titleB: string;
  decision: string;
  confidence: number;
  method: string;
  reasonsJson: string;
  adminStatus: string;
  adminOverride: string | null;
}

const DECISIONS = ["EXACT_MATCH", "SIMILAR_ALTERNATIVE", "DIFFERENT"];

export default function MatchReviewPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/matches?status=${status}&limit=200`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setStats(data.stats ?? {});
    setLoading(false);
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  async function act(id: string, action: "approve" | "reject", override?: string) {
    await fetch("/api/admin/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, override }),
    });
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-stone-900">Match review</h1>
      <p className="mt-1 text-sm text-stone-500">
        Approve correct matches or reject + correct bad ones. Your decision becomes the source of
        truth for that pair (feedback loop).
      </p>

      <div className="my-4 flex gap-2 text-sm">
        {["pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 font-medium ${status === s ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"}`}
          >
            {s} {stats[s] != null ? `(${stats[s]})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-400">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const reasons = (() => { try { return JSON.parse(r.reasonsJson) as string[]; } catch { return []; } })();
            const low = r.decision === "EXACT_MATCH" && r.confidence < 0.85;
            return (
              <li key={r.id} className="rounded-xl border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded px-2 py-0.5 font-semibold ${r.decision === "EXACT_MATCH" ? "bg-emerald-100 text-emerald-800" : r.decision === "SIMILAR_ALTERNATIVE" ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"}`}>
                    {r.decision}
                  </span>
                  <span className="text-stone-500">conf {(r.confidence * 100).toFixed(0)}% · {r.method}</span>
                  {low && <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-700">low-confidence exact ⚠</span>}
                </div>
                <div className="mt-2 grid gap-1 text-sm text-stone-800 sm:grid-cols-2">
                  <p className="truncate"><span className="text-stone-400">A:</span> {r.titleA}</p>
                  <p className="truncate"><span className="text-stone-400">B:</span> {r.titleB}</p>
                </div>
                {reasons.length > 0 && (
                  <p className="mt-1 text-xs text-stone-400">{reasons.join(" · ")}</p>
                )}
                {status === "pending" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => act(r.id, "approve")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">Approve</button>
                    <span className="text-xs text-stone-400 self-center">or correct to:</span>
                    {DECISIONS.filter((d) => d !== r.decision).map((d) => (
                      <button key={d} onClick={() => act(r.id, "reject", d)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700">
                        {d}
                      </button>
                    ))}
                  </div>
                )}
                {status !== "pending" && r.adminOverride && (
                  <p className="mt-2 text-xs text-stone-500">admin → <strong>{r.adminOverride}</strong></p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
