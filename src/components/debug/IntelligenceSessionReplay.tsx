"use client";

import { BETA_COHORT_LABELS, normalizeBetaCohort, type BetaCohort } from "@/lib/commerce-intelligence/beta/cohort";
import { useEffect, useMemo, useState } from "react";

type Json = Record<string, unknown>;

function qualityBadge(trail: string[], matched: boolean): { label: string; className: string } {
  if (trail.includes("offer_click") && matched) {
    return { label: "Successful", className: "bg-emerald-100 text-emerald-900" };
  }
  if (trail.includes("analyst_mode_open")) {
    return { label: "Hesitant", className: "bg-amber-100 text-amber-900" };
  }
  if (trail.includes("trust_details_open") || trail.includes("recommendation_shown")) {
    return { label: "Engaged", className: "bg-sage-100 text-sage-900" };
  }
  return { label: "Abandoned", className: "bg-stone-100 text-stone-600" };
}

export function IntelligenceSessionReplay() {
  const [data, setData] = useState<Json | null>(null);
  const [selected, setSelected] = useState<Json | null>(null);
  const [cohortFilter, setCohortFilter] = useState<BetaCohort | "all">("all");

  async function load() {
    const res = await fetch("/api/debug/intelligence-sessions", { cache: "no-store" });
    if (res.ok) setData((await res.json()) as Json);
  }

  useEffect(() => {
    void load();
  }, []);

  const interpretation = (data?.interpretation ?? {}) as Json;
  const insights = (interpretation.insights as Array<Json>) ?? [];
  const sessionQuality = (data?.sessionQuality ?? {}) as Json;
  const allSessions = (data?.sessions as Array<Json>) ?? [];

  const sessions = useMemo(() => {
    if (cohortFilter === "all") return allSessions;
    return allSessions.filter((s) => normalizeBetaCohort(String(s.cohort ?? "")) === cohortFilter);
  }, [allSessions, cohortFilter]);

  const cohortsInData = useMemo(() => {
    const set = new Set<BetaCohort>();
    for (const s of allSessions) {
      set.add(normalizeBetaCohort(String(s.cohort ?? "")));
    }
    return [...set];
  }, [allSessions]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-bold text-stone-900">Session replay</h1>
        <p className="mt-1 text-sm text-stone-600">
          Anonymized recommendation sessions — filter by cohort, triage quality.{" "}
          <a href="/debug/intelligence-ops" className="text-sage-700 underline">
            Ops dashboard
          </a>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-sage-700 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Refresh
          </button>
          <label className="flex items-center gap-2 text-xs text-stone-600">
            Cohort
            <select
              value={cohortFilter}
              onChange={(e) => setCohortFilter(e.target.value as BetaCohort | "all")}
              className="rounded-lg border border-stone-200 px-2 py-1 text-sm"
            >
              <option value="all">All</option>
              {cohortsInData.map((c) => (
                <option key={c} value={c}>
                  {BETA_COHORT_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
          <p className="text-xs text-stone-500">Successful</p>
          <p className="text-lg font-semibold">{String(sessionQuality.successful ?? 0)}</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
          <p className="text-xs text-stone-500">Abandoned</p>
          <p className="text-lg font-semibold">{String(sessionQuality.abandoned ?? 0)}</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
          <p className="text-xs text-stone-500">Detail rate</p>
          <p className="text-lg font-semibold">
            {Math.round(((sessionQuality.detailUsageRate as number) ?? 0) * 100)}%
          </p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
          <p className="text-xs text-stone-500">Onboarding done / skip</p>
          <p className="text-lg font-semibold">
            {String(sessionQuality.onboardingCompleted ?? 0)} /{" "}
            {String(sessionQuality.onboardingSkipped ?? 0)}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-sage-200 bg-sage-50/50 p-4">
        <p className="font-semibold text-stone-900">{String(interpretation.headline ?? "")}</p>
        <ul className="mt-3 space-y-2">
          {insights.slice(0, 4).map((ins) => (
            <li
              key={String(ins.id)}
              className={`rounded-lg px-3 py-2 text-sm ${
                ins.priority === "high" ?
                  "bg-red-50 text-red-900"
                : "bg-white text-stone-700"
              }`}
            >
              {String(ins.message)}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ul className="max-h-[32rem] space-y-2 overflow-y-auto rounded-xl border border-stone-200 bg-white p-2">
          {sessions.map((s) => {
            const trail = (s.interactionTrail as string[]) ?? [];
            const badge = qualityBadge(trail, Boolean(s.matched));
            return (
              <li key={String(s.id)}>
                <button
                  type="button"
                  onClick={() => setSelected(s)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    selected?.id === s.id ? "bg-sage-100" : "hover:bg-stone-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-stone-400">
                      {String(s.at).slice(0, 19)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <span className="mt-1 block font-medium">{String(s.queryCategory)}</span>
                  <span className="text-xs text-stone-500">
                    {s.cohort ? BETA_COHORT_LABELS[normalizeBetaCohort(String(s.cohort))] : "—"}
                    {s.matched ? " · matched" : " · no match"}
                  </span>
                </button>
              </li>
            );
          })}
          {!sessions.length && (
            <li className="p-4 text-sm text-stone-500">
              No sessions for this filter. Set INTELLIGENCE_BETA_MODE=1 and use chat or inventory.
            </li>
          )}
        </ul>

        {selected && (
          <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-700">
            <h2 className="font-semibold text-stone-900">Replay detail</h2>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="text-xs text-stone-500">Cohort</dt>
                <dd>
                  {selected.cohort ?
                    BETA_COHORT_LABELS[normalizeBetaCohort(String(selected.cohort))]
                  : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Category</dt>
                <dd>{String(selected.queryCategory)}</dd>
              </div>
              {selected.queryPreview ? (
                <div>
                  <dt className="text-xs text-stone-500">Query preview</dt>
                  <dd className="font-mono text-xs">{String(selected.queryPreview)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-stone-500">Trust summary</dt>
                <dd className="leading-relaxed">{String(selected.trustSummary)}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Winner</dt>
                <dd>
                  {selected.winnerRetailer ?
                    `${String(selected.winnerRetailer)} · $${selected.winnerPrice}`
                  : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Uncertainty</dt>
                <dd>{String(selected.uncertaintyCount ?? 0)} signal(s)</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-500">Interactions</dt>
                <dd className="break-words">
                  {((selected.interactionTrail as string[]) ?? []).join(" → ")}
                </dd>
              </div>
              {selected.feedback ? (
                <div>
                  <dt className="text-xs text-stone-500">Feedback</dt>
                  <dd>
                    {(() => {
                      const fb = selected.feedback as {
                        useful?: boolean;
                        whyNot?: string;
                        explanationHelpful?: boolean;
                        bought?: boolean;
                      };
                      return (
                        <>
                          {fb.useful === true ?
                            "Useful"
                          : fb.useful === false ?
                            `Not useful${fb.whyNot ? ` (${fb.whyNot})` : ""}`
                          : "—"}
                          {fb.explanationHelpful === true ?
                            " · explanation helped"
                          : fb.explanationHelpful === false ?
                            " · explanation unclear"
                          : null}
                          {fb.bought ? " · bought anyway" : null}
                        </>
                      );
                    })()}
                  </dd>
                </div>
              ) : null}
              {selected.canonicalId ? (
                <div>
                  <dt className="text-xs text-stone-500">Product</dt>
                  <dd>
                    <a
                      href={`/inventory/products/${encodeURIComponent(String(selected.canonicalId))}`}
                      className="font-semibold text-sage-700 underline"
                    >
                      Open product page
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        )}
      </section>
    </main>
  );
}
