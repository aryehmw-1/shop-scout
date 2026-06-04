"use client";

import { useEffect, useState } from "react";

type Json = Record<string, unknown>;

async function fetchJson(url: string): Promise<Json | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Json;
  } catch {
    return null;
  }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-lg font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function AlertBanner({ alerts }: { alerts: Array<Json> }) {
  const critical = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");
  if (!critical.length && !warnings.length) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        Launch checks clear.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {[...critical, ...warnings].map((a, i) => (
        <li
          key={String(a.id ?? i)}
          className={`rounded-lg px-3 py-2 text-sm ${
            a.severity === "critical" ?
              "border border-red-200 bg-red-50 text-red-900"
            : "border border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {String(a.message)}
          {a.action ? (
            <span className="mt-1 block text-xs opacity-80">→ {String(a.action)}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function IntelligenceOpsDashboard() {
  const [ops, setOps] = useState<Json | null>(null);

  async function refresh() {
    setOps(await fetchJson("/api/debug/intelligence-ops"));
  }

  useEffect(() => {
    void refresh();
  }, []);

  const snap = (ops?.snapshot ?? {}) as Json;
  const launch = (ops?.launch ?? {}) as Json;
  const deploy = (launch.deploy ?? {}) as Json;
  const usefulness = (ops?.usefulness ?? {}) as Json;
  const engagement = (usefulness.engagement ?? {}) as Json;
  const outcomes = (usefulness.outcomes ?? {}) as Json;
  const gates =
    ((snap.regressionGates as Json)?.gates as Array<Json> | undefined) ?? [];
  const alerts = (launch.alerts as Array<Json> | undefined) ?? [];
  const betaAlerts = ((ops?.beta as Json)?.alerts as Array<Json> | undefined) ?? [];
  const betaSummary = ((ops?.beta as Json)?.summary as Json) ?? {};
  const betaLearning = ((ops?.beta as Json)?.learning as Json) ?? {};
  const sessionSuccess = ((ops?.beta as Json)?.sessionSuccess as Json) ?? {};
  const friction = (betaLearning.friction ?? {}) as Json;
  const retention = (betaLearning.retention ?? {}) as Json;
  const issueClusters = ((betaLearning.issueClusters as Json)?.clusters as Array<Json>) ?? [];
  const trustLearning = (betaLearning.trust ?? {}) as Json;
  const categoryStrength = (betaLearning.categoryStrength ?? {}) as Json;
  const sessionQuality = (betaLearning.sessionQuality ?? {}) as Json;
  const cohortBreakdown = ((betaLearning.cohorts as Json)?.cohorts as Array<Json>) ?? [];
  const flags = (launch.flags ?? {}) as Json;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="rounded-xl border border-sage-200 bg-sage-50/50 p-4">
        <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">Intelligence Ops</h1>
        <p className="mt-1 text-sm text-stone-600">
          Launch readiness, product learning, and system health.{" "}
          <a href="/debug/control-center" className="text-sage-700 underline">
            Control center
          </a>
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-3 min-h-10 rounded-lg bg-sage-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sage-800"
        >
          Refresh
        </button>
      </header>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-stone-900">Launch status</h2>
        <p className="mt-1 text-sm text-stone-600">
          Deploy ready:{" "}
          <span className={deploy.ready ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
            {deploy.ready ? "Yes" : "No"}
          </span>
        </p>
        <div className="mt-3">
          <AlertBanner alerts={alerts} />
        </div>
        <p className="mt-3 text-xs text-stone-500">
          Flags: safeMode={String(flags.safeMode)} · router={String(flags.chatRouter)} ·
          experiments={String(flags.experiments)}
        </p>
      </section>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Graphs" value={String(snap.graphCount ?? "—")} />
        <Stat
          label="Trust expansion"
          value={`${Math.round(((engagement.trustExpansionRate as number) ?? 0) * 100)}%`}
        />
        <Stat
          label="Acceptance proxy"
          value={`${Math.round(((outcomes.acceptanceProxy as number) ?? 0) * 100)}%`}
        />
        <Stat label="Shown" value={String(engagement.recommendationsShown ?? 0)} />
      </section>

      <section className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
        <h2 className="text-lg font-semibold text-stone-900">Beta operator summary</h2>
        <p className="mt-1 text-sm font-medium capitalize text-stone-800">
          Verdict: {String(betaSummary.verdict ?? "insufficient_data").replace(/_/g, " ")}
        </p>
        <ul className="mt-3 space-y-2 text-sm text-stone-700">
          {((betaSummary.bullets as Array<Json>) ?? []).map((b, i) => (
            <li
              key={i}
              className={
                b.priority === "action" ? "font-semibold text-red-900"
                : b.priority === "positive" ? "text-emerald-900"
                : ""
              }
            >
              {String(b.text)}
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid gap-2 text-xs text-stone-600 sm:grid-cols-2">
          {Object.entries((betaSummary.sections as Json) ?? {}).map(([k, v]) => (
            <div key={k}>
              <dt className="font-semibold capitalize text-stone-700">{k.replace(/([A-Z])/g, " $1")}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-stone-700">{String(sessionSuccess.headline ?? "")}</p>
        <p className="mt-1 text-sm text-stone-600">
          {(betaLearning.executiveSummary as string[] | undefined)?.slice(0, 2).join(" ") ??
            "Collecting beta signals."}
        </p>
        <p className="mt-2 text-sm font-medium text-stone-800">{String(retention.headline ?? "")}</p>
        <ul className="mt-3 space-y-2 text-sm text-stone-600">
          {((friction.insights as Array<Json>) ?? []).slice(0, 4).map((ins) => (
            <li key={String(ins.id)}>
              <span className={ins.severity === "high" ? "font-semibold text-red-800" : ""}>
                {String(ins.message)}
              </span>
            </li>
          ))}
        </ul>
        {issueClusters.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm text-stone-600">
            {issueClusters.slice(0, 4).map((c) => (
              <li key={String(c.id)}>
                <span className="font-medium text-stone-800">{String(c.theme)}</span>
                {Array.isArray(c.actions) && c.actions[0] ?
                  <span className="block text-xs text-stone-500">{String(c.actions[0])}</span>
                : null}
              </li>
            ))}
          </ul>
        )}
        {(trustLearning.honestyWordingHints as string[] | undefined)?.[0] && (
          <p className="mt-2 text-xs text-sage-800">
            Trust copy: {String((trustLearning.honestyWordingHints as string[])[0])}
          </p>
        )}
        {cohortBreakdown.length > 0 && (
          <div className="mt-3 text-xs text-stone-600">
            <span className="font-semibold text-stone-800">Cohorts: </span>
            {cohortBreakdown
              .slice(0, 4)
              .map((c) => `${String(c.label)} (${String(c.sessions)})`)
              .join(" · ")}
          </div>
        )}
        <div className="mt-3 grid gap-2 text-xs text-stone-600 sm:grid-cols-2">
          <p>
            Sessions: {String(sessionQuality.successful ?? 0)} ok ·{" "}
            {String(sessionQuality.abandoned ?? 0)} abandoned ·{" "}
            {String(sessionQuality.hesitant ?? 0)} hesitant
          </p>
          <p>{String(categoryStrength.productFocusHeadline ?? "")}</p>
        </div>
        {betaAlerts.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-stone-800">Beta alerts</h3>
            <AlertBanner alerts={betaAlerts} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-stone-900">Actionable insights</h2>
        <p className="mt-1 text-sm font-medium text-stone-800">
          {String((ops?.interpretation as Json)?.headline ?? "")}
        </p>
        <ul className="mt-3 space-y-2 text-sm text-stone-600">
          {(((ops?.interpretation as Json)?.insights as Array<Json>) ?? []).map((ins) => (
            <li key={String(ins.id)}>
              <span
                className={
                  ins.priority === "high" ? "font-semibold text-red-800" : ""
                }
              >
                {String(ins.message)}
              </span>
            </li>
          ))}
        </ul>
        <a
          href="/debug/intelligence-sessions"
          className="mt-3 inline-block text-sm font-semibold text-sage-700 underline"
        >
          Session replay →
        </a>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-stone-900">Regression gates</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {gates.map((g) => (
            <li key={String(g.id)} className={g.passed ? "text-stone-700" : "text-red-700"}>
              {g.passed ? "✓" : "✗"} {String(g.id)}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
        <h2 className="text-lg font-semibold text-stone-900">Recovery</h2>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            Pre-deploy: <code className="text-xs">npm run demo:deploy-verify</code>
          </li>
          <li>
            Session sim: <code className="text-xs">npm run demo:intelligence-session-sim</code>
          </li>
          <li>
            Replay UI: <a href="/debug/intelligence-sessions" className="text-sage-700 underline">/debug/intelligence-sessions</a>
          </li>
          <li>
            Full eval: <code className="text-xs">npm run demo:eval-intelligence</code>
          </li>
          <li>Safe mode: set <code className="text-xs">INTELLIGENCE_SAFE_MODE=1</code></li>
        </ul>
      </section>
    </main>
  );
}
