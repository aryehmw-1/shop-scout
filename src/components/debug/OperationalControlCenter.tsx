"use client";

import { useEffect, useMemo, useState } from "react";

const FORCE_PARITY_STORAGE_KEY = "brand.force.parity";

type Json = Record<string, any>;

async function fetchJson(url: string): Promise<Json | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function OperationalControlCenter() {
  const [brandVisual, setBrandVisual] = useState<Json | null>(null);
  const [brandHistory, setBrandHistory] = useState<Json | null>(null);
  const [retailerHealth, setRetailerHealth] = useState<Json | null>(null);
  const [ingestion, setIngestion] = useState<Json | null>(null);
  const [blocking, setBlocking] = useState<Json | null>(null);
  const [strategy, setStrategy] = useState<Json | null>(null);
  const [platformHealth, setPlatformHealth] = useState<Json | null>(null);
  const [retailerReadiness, setRetailerReadiness] = useState<Json | null>(null);
  const [forcedParity, setForcedParity] = useState(true);
  const [runtimeFaviconHref, setRuntimeFaviconHref] = useState("");
  const [dpr, setDpr] = useState(1);

  async function refresh() {
    const [v, h, r, i, b, s, ph, rr] = await Promise.all([
      fetchJson("/api/debug/brand-visual"),
      fetchJson("/api/debug/brand-audit-history"),
      fetchJson("/api/debug/retailer-health"),
      fetchJson("/api/debug/ingestion-efficiency"),
      fetchJson("/api/debug/request-blocking"),
      fetchJson("/api/debug/strategy-analytics"),
      fetchJson("/api/debug/platform-health"),
      fetchJson("/api/debug/retailer-readiness"),
    ]);
    setBrandVisual(v);
    setBrandHistory(h);
    setRetailerHealth(r);
    setIngestion(i);
    setBlocking(b);
    setStrategy(s);
    setPlatformHealth(ph);
    setRetailerReadiness(rr);
  }

  useEffect(() => {
    void refresh();
    const stored = localStorage.getItem(FORCE_PARITY_STORAGE_KEY);
    setForcedParity(stored !== "0");
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    setRuntimeFaviconHref(link?.href ?? "");
    setDpr(window.devicePixelRatio || 1);
  }, []);

  const proxyRows = useMemo(
    () => (ingestion?.proxyObservability as Array<Json> | undefined) ?? [],
    [ingestion],
  );
  const retailerRows = useMemo(
    () => (retailerHealth?.retailers as Array<Json> | undefined) ?? [],
    [retailerHealth],
  );
  const readinessRows = useMemo(
    () => (retailerReadiness?.retailers as Array<Json> | undefined) ?? [],
    [retailerReadiness],
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="rounded-xl border border-stone-200 bg-white p-4">
        <h1 className="text-2xl font-bold text-stone-900">Operational Control Center</h1>
        <p className="mt-1 text-sm text-stone-600">
          Unified visual parity + ingestion/proxy observability dashboard.{" "}
          <a href="/debug/experiments" className="text-sage-700 underline">
            Detection experiments →
          </a>
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-3 rounded-lg bg-sage-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sage-800"
        >
          Refresh
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Forced parity state" value={forcedParity ? "ON" : "OFF"} />
        <Stat label="devicePixelRatio" value={dpr.toFixed(2)} />
        <Stat label="Products (DB)" value={platformHealth?.database?.products ?? "n/a"} />
        <Stat label="Active quotes" value={platformHealth?.database?.activeQuotes ?? "n/a"} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Navbar vs favicon diff" value={`${brandVisual?.comparisons?.[1]?.diffPct?.toFixed?.(3) ?? "n/a"}%`} />
        <Stat label="Residential usage %" value={`${((platformHealth?.orchestration?.residentialUsagePct ?? 0) * 100).toFixed(1)}%`} />
        <Stat label="Orchestration events" value={platformHealth?.orchestration?.totalEvents ?? 0} />
        <Stat label="Latest visual run" value={brandHistory?.latestVisual?.runId ?? "n/a"} />
      </section>

      <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
        <h2 className="text-lg font-semibold text-indigo-950">Brand/favicons runtime</h2>
        <p className="mt-2 text-xs">
          Runtime favicon href: <code>{runtimeFaviconHref || "not detected"}</code>
        </p>
        <p className="mt-1 text-xs">
          API favicon URL: <code>{brandVisual?.faviconUrl ?? "n/a"}</code>
        </p>
        <p className="mt-1 text-xs">
          Hash: <code>{brandVisual?.faviconHash ?? "n/a"}</code> · ETag:{" "}
          <code>{brandVisual?.etag ?? "n/a"}</code>
        </p>
        <p className="mt-1 text-xs">
          Last modified: <code>{brandVisual?.lastModified ?? "n/a"}</code>
        </p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-stone-900">Brand audit history</h2>
        <p className="mt-1 text-xs text-stone-600">
          History root: <code>{brandHistory?.artifactRoot ?? "artifacts/brand-audit/history"}</code>
        </p>
        <div className="mt-3 max-h-64 overflow-auto rounded border border-stone-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50">
              <tr>
                <th className="px-2 py-1">Run ID</th>
                <th className="px-2 py-1">Visual mismatch %</th>
                <th className="px-2 py-1">Browser entries</th>
              </tr>
            </thead>
            <tbody>
              {(brandHistory?.runs ?? []).map((r: Json) => (
                <tr key={r.runId} className="border-t">
                  <td className="px-2 py-1 font-mono">{r.runId}</td>
                  <td className="px-2 py-1">
                    {r.visual?.navbarVsFaviconPct != null ? `${r.visual.navbarVsFaviconPct}%` : "n/a"}
                  </td>
                  <td className="px-2 py-1">{r.browser?.browsers?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Retailer readiness (production)">
          <SimpleTable
            headers={["Retailer", "Status", "Method", "Confidence", "Active quotes", "Affiliate", "Challenge"]}
            rows={readinessRows.map((r) => [
              r.displayName ?? r.retailerId,
              r.status,
              r.acquisitionMethod,
              r.confidenceScore,
              r.activeQuotes,
              r.affiliateReadiness,
              r.challengeRate,
            ])}
          />
          {(platformHealth?.persistenceNotes as string[] | undefined)?.length ? (
            <ul className="mt-2 list-disc pl-4 text-xs text-amber-800">
              {(platformHealth?.persistenceNotes as string[]).map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <Panel title="Platform persistence & orchestration">
          <SimpleTable
            headers={["Metric", "Value"]}
            rows={[
              ["Visible quotes (tiered)", platformHealth?.freshness?.visibleQuotes ?? "n/a"],
              ["Stale visible count", platformHealth?.freshness?.staleVisibleCount ?? "n/a"],
              ["Refresh backlog", platformHealth?.freshness?.refreshBacklog ?? "n/a"],
              ["Expired quotes (hard)", platformHealth?.database?.expiredQuotes ?? "n/a"],
              ["Search sessions", platformHealth?.database?.searchSessions ?? "n/a"],
              ["Experiment batches", platformHealth?.database?.experimentBatches ?? "n/a"],
              ["Avg cost / success", platformHealth?.orchestration?.avgCostPerSuccess ?? "n/a"],
              ["Amazon PA-API", platformHealth?.ingestion?.amazonPaapiConfigured ? "configured" : "missing"],
              ["Last index fetch %", platformHealth?.acquisition?.fetchSuccessRate != null ? `${((platformHealth.acquisition.fetchSuccessRate as number) * 100).toFixed(1)}%` : "n/a"],
              ["Last index persist %", platformHealth?.acquisition?.verifiedPersistenceRate != null ? `${((platformHealth.acquisition.verifiedPersistenceRate as number) * 100).toFixed(1)}%` : "n/a"],
              ["Last index bottleneck", platformHealth?.acquisition?.bottleneck ?? "n/a"],
            ]}
          />
          {platformHealth?.freshness?.frontendEmptyStateWarning ? (
            <p className="mt-2 text-xs font-medium text-amber-800">
              {platformHealth.freshness.frontendEmptyStateWarning}
            </p>
          ) : null}
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Retailer health">
          <SimpleTable
            headers={["Retailer", "Status", "Fetch %", "Parser %", "Proxy Req %", "Bandwidth MB"]}
            rows={retailerRows.map((r) => [
              r.retailerId,
              r.status,
              `${((r.fetchSuccessRate ?? 0) * 100).toFixed(1)}%`,
              `${((r.parserSuccessRate ?? 0) * 100).toFixed(1)}%`,
              r.proxyRequestPct != null ? `${r.proxyRequestPct}%` : "n/a",
              r.bandwidthBytes ? (r.bandwidthBytes / (1024 * 1024)).toFixed(2) : "0.00",
            ])}
          />
        </Panel>

        <Panel title="Proxy routing observability">
          <SimpleTable
            headers={["Retailer", "Mode", "Endpoint", "Selections", "Retries", "Proxy fails", "Timeouts", "Fallback->direct"]}
            rows={proxyRows.map((r) => [
              r.retailerId,
              r.lastRouteMode ?? "n/a",
              r.lastProxyEndpoint ?? "n/a",
              r.routeSelections ?? 0,
              r.retries ?? 0,
              r.proxyFailures ?? 0,
              r.timeoutFailures ?? 0,
              r.fallbackToDirect ?? 0,
            ])}
          />
          <p className="mt-2 text-xs text-stone-600">
            Proxy pool: <code>{ingestion?.proxyAvailability?.configured?.join(", ") || "none"}</code>
          </p>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Ingestion efficiency">
          <SimpleTable
            headers={["Retailer", "Success %", "Blocked %", "Proxy fallback %", "avg KB/request", "avg req/product"]}
            rows={(ingestion?.efficiency?.perRetailer ?? []).map((r: Json) => [
              r.retailerId,
              `${r.successRate}%`,
              `${r.blockedPct}%`,
              `${r.proxyFallbackPct}%`,
              r.avgKbPerRequest,
              r.avgRequestsPerProduct,
            ])}
          />
          <p className="mt-2 text-xs text-stone-600">
            Nightly GB est: <code>{ingestion?.efficiency?.totals?.nightlyGbEstimate ?? 0}</code> · Monthly GB
            est: <code>{ingestion?.efficiency?.totals?.monthlyGbEstimate ?? 0}</code>
          </p>
        </Panel>

        <Panel title="Request blocking verification">
          <SimpleTable
            headers={["Class", "Blocked", "Allowed", "Est saved KB"]}
            rows={(blocking?.classes ?? []).map((c: Json) => [
              c.className,
              c.blocked,
              c.allowed,
              c.estimatedSavedKb,
            ])}
          />
          <p className="mt-2 text-xs text-stone-600">
            Blocked %: <code>{blocking?.totals?.blockedPct ?? 0}%</code> · Est saved MB:{" "}
            <code>{blocking?.totals?.estimatedSavedMb ?? 0}</code>
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Visual run: <code>{blocking?.sourceRuns?.visualRunId ?? "n/a"}</code> · Browser run:{" "}
            <code>{blocking?.sourceRuns?.browserRunId ?? "n/a"}</code>
          </p>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Strategy effectiveness">
          <p className="mb-2 text-xs text-stone-600">
            Rendered executor: <code>{strategy?.renderedEnabled ? "ENABLED" : "disabled"}</code>
          </p>
          <SimpleTable
            headers={["Retailer", "Method", "Behavior", "Transport", "Attempts", "Success %", "Block %", "CAPTCHA %", "avg ms"]}
            rows={(strategy?.effectiveness ?? []).map((r: Json) => [
              r.retailerId,
              r.method,
              r.behavior ?? "-",
              r.transport,
              r.attempts,
              `${r.successRate}%`,
              `${r.blockRate}%`,
              `${r.captchaRate}%`,
              r.avgLatencyMs,
            ])}
          />
          <p className="mt-2 text-xs text-stone-500">
            Configured strategies:{" "}
            {(strategy?.strategies ?? [])
              .map((s: Json) => `${s.retailerId}:${s.method}/${s.proxyPolicy}`)
              .join(" · ") || "n/a"}
          </p>
        </Panel>

        <Panel title="Challenge vault (anti-bot research)">
          <SimpleTable
            headers={["Retailer", "Category", "Reason", "Vendor", "Status", "Method"]}
            rows={(strategy?.challengeVault?.recent ?? []).slice(0, 12).map((c: Json) => [
              c.retailerId,
              c.category,
              c.reason,
              c.vendor ?? "-",
              c.status,
              c.method ?? "-",
            ])}
          />
          <p className="mt-2 text-xs text-stone-600">
            By vendor:{" "}
            <code>
              {Object.entries(strategy?.challengeVault?.summary?.byVendor ?? {})
                .map(([k, v]) => `${k}:${v}`)
                .join(", ") || "none"}
            </code>
          </p>
        </Panel>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <p className="text-xs text-stone-600">{label}</p>
      <p className="mt-1 font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="max-h-64 overflow-auto rounded border border-stone-200">
      <table className="w-full text-left text-xs">
        <thead className="bg-stone-50">
          <tr>{headers.map((h) => <th key={h} className="px-2 py-1">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              {row.map((cell, j) => <td key={j} className="px-2 py-1">{String(cell)}</td>)}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-2 py-2 text-stone-500" colSpan={headers.length}>
                No data yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
