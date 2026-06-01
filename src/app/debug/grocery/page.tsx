"use client";

import { useCallback, useState } from "react";
import type { GroceryRetrievalDebugSummary } from "@/lib/types";
import { tierDisplayLabel } from "@/lib/search/retrieval-meta";
import Link from "next/link";

const EXAMPLES = [
  "Cheez-It Original Cheese Crackers",
  "Great Value Whole Milk",
  "Lay's Classic Potato Chips",
  "Honey nut cereal",
];

export default function DebugGroceryPage() {
  const [query, setQuery] = useState("Cheez-It Original Cheese Crackers");
  const [zip, setZip] = useState("");
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<GroceryRetrievalDebugSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTrace = useCallback(async (q?: string) => {
    const term = (q ?? query).trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: term });
      if (/^\d{5}$/.test(zip)) params.set("zip", zip);
      const res = await fetch(`/api/debug/grocery?${params}`);
      if (!res.ok) throw new Error(await res.text());
      setTrace(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trace failed");
      setTrace(null);
    } finally {
      setLoading(false);
    }
  }, [query, zip]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <Link href="/debug/icons" className="text-sm text-stone-500 hover:text-stone-800">
          ← Icon audit
        </Link>
        <h1 className="font-homy mt-2 text-3xl font-bold text-stone-900">Grocery retrieval trace</h1>
        <p className="mt-2 text-sm text-stone-600">
          Visualize tier, normalization, candidates, and rejection reasons for grocery queries.
        </p>
      </div>

      <form
        className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void runTrace();
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Product query"
          className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm"
        />
        <input
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          placeholder="ZIP (optional)"
          className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm sm:w-28"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-sage-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sage-700 disabled:opacity-60"
        >
          {loading ? "Tracing…" : "Run trace"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setQuery(ex);
              void runTrace(ex);
            }}
            className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-700 hover:bg-stone-100"
          >
            {ex}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {trace && (
        <div className="mt-6 space-y-4">
          <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-sky-800">Query</h2>
            <p className="mt-1 font-semibold text-stone-900">{trace.query}</p>
            <p className="text-xs text-stone-600">Normalized: {trace.normalizedQuery}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge label={trace.isGroceryQuery ? "Grocery query" : "Not grocery"} tone="sky" />
              {trace.parsedBrand && <Badge label={`Brand: ${trace.parsedBrand}`} />}
              {trace.parsedCategory && <Badge label={`Category: ${trace.parsedCategory}`} />}
              {trace.tierReached && (
                <Badge label={`Tier: ${tierDisplayLabel(trace.tierReached)}`} tone="violet" />
              )}
              {trace.resolverConfidence != null && (
                <Badge label={`Confidence: ${Math.round(trace.resolverConfidence * 100)}%`} />
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-stone-700">Resolution</h2>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-stone-500">Catalog ID</dt>
                <dd className="font-mono text-xs">{trace.resolvedCatalogId ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Title</dt>
                <dd>{trace.resolvedTitle ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Match reason</dt>
                <dd className="font-mono text-xs">{trace.matchReason ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Fallback tier executed</dt>
                <dd>{trace.fallbackTierExecuted ? "Yes" : "No"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-stone-700">
              Candidates ({trace.candidateRetrievals.length})
            </h2>
            <ul className="mt-2 space-y-2">
              {trace.candidateRetrievals.map((c) => (
                <li
                  key={c.catalogId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm"
                >
                  <span>
                    <strong>{c.brand}</strong> {c.title}
                    <span className="ml-2 font-mono text-[10px] text-stone-500">{c.catalogId}</span>
                  </span>
                  <span className="text-xs text-stone-600">
                    score {c.score}
                    {c.tier ? ` · ${tierDisplayLabel(c.tier)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {trace.rejectionReasons.length > 0 && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-amber-900">
                Rejection / pipeline notes
              </h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-950">
                {trace.rejectionReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs text-stone-600">
            <p>
              Enable server logging with{" "}
              <code className="rounded bg-white px-1">GROCERY_RETRIEVAL_DEBUG=1</code> for live
              search dead-ends.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

function Badge({
  label,
  tone = "stone",
}: {
  label: string;
  tone?: "stone" | "sky" | "violet";
}) {
  const cls =
    tone === "sky" ? "bg-sky-100 text-sky-900 ring-sky-200"
    : tone === "violet" ? "bg-violet-100 text-violet-900 ring-violet-200"
    : "bg-stone-100 text-stone-800 ring-stone-200";
  return <span className={`rounded-full px-2 py-0.5 ring-1 ${cls}`}>{label}</span>;
}
