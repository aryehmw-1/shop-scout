import Link from "next/link";
import { runOperationalAudit } from "@/lib/audit/operational-audit";
import { runQualityChecks } from "@/lib/monitoring/quality-alerts";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function pct(n: number, d: number): string {
  return d ? `${((n / d) * 100).toFixed(1)}%` : "—";
}

function fmtRate(r: number | null): string {
  return r != null ? `${(r * 100).toFixed(0)}%` : "—";
}

export default async function QualityDashboardPage() {
  const [audit, alerts, quoteSources, staleCount] = await Promise.all([
    runOperationalAudit(),
    runQualityChecks(),
    prisma.priceQuote.groupBy({
      by: ["source"],
      _count: { id: true },
    }),
    prisma.priceQuote.count({
      where: {
        source: { in: ["scraped", "connector_api", "daily_index", "nightly_index"] },
        fetchedAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const c = audit.coverage;
  const le = audit.learningEvents;
  const verifiedQuotes = quoteSources
    .filter((s) =>
      ["scraped", "connector_api", "daily_index", "nightly_index"].includes(s.source),
    )
    .reduce((a, s) => a + s._count.id, 0);
  const totalQuotes = quoteSources.reduce((a, s) => a + s._count.id, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Operational dashboard</h1>
          <p className="text-sm text-stone-500">
            Generated {new Date(audit.generatedAt).toLocaleString()} · measurable production truth
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/admin/links" className="text-sage-700 hover:underline">
            Link ingestion →
          </Link>
          <Link href="/admin/analytics" className="text-sage-700 hover:underline">
            Product analytics →
          </Link>
          <Link href="/admin/offers" className="text-sage-700 hover:underline">
            Offer debug →
          </Link>
        </div>
      </div>

      {alerts.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 font-semibold text-amber-900">
            Active alerts ({alerts.length})
          </h2>
          <ul className="space-y-1 text-sm text-amber-900">
            {alerts.slice(0, 6).map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.title}:</span> {a.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Catalog products" value={c.totalCatalogProducts} />
        <StatCard
          label="Production-usable"
          value={`${c.productionUsable} (${pct(c.productionUsable, c.totalCatalogProducts)})`}
          highlight={c.productionUsable < c.totalCatalogProducts * 0.3}
        />
        <StatCard label="With verified offers" value={`${c.withVerifiedOffers} (${pct(c.withVerifiedOffers, c.totalCatalogProducts)})`} />
        <StatCard
          label="Expired verified"
          value={`${c.withExpiredVerifiedOffers} (${pct(c.withExpiredVerifiedOffers, c.totalCatalogProducts)})`}
          highlight={c.withExpiredVerifiedOffers > 0}
        />
        <StatCard label="Estimated only" value={`${c.withEstimatedOnly} (${pct(c.withEstimatedOnly, c.totalCatalogProducts)})`} />
        <StatCard label="Zero offers" value={c.withZeroUsableOffers} highlight={c.withZeroUsableOffers > 0} />
        <StatCard label="Stale verified (>48h)" value={staleCount} highlight={staleCount > 10} />
        <StatCard label="Verified quote rows" value={`${verifiedQuotes} / ${totalQuotes}`} />
        <StatCard
          label="Cache hit rate (24h)"
          value={le.cacheHitRate != null ? fmtRate(le.cacheHitRate) : "—"}
        />
        <StatCard label="Searches (24h)" value={le.searches24h} />
        <StatCard label="Clicks (24h)" value={le.clicks24h} />
        <StatCard
          label="Enrichment latency"
          value={le.enrichmentLatencyAvgMs != null ? `${Math.round(le.enrichmentLatencyAvgMs)}ms` : "—"}
        />
        <StatCard
          label="A-grade products"
          value={`${audit.gradeDistribution.A} / ${c.totalCatalogProducts}`}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-stone-800">Product quality distribution</h2>
        <div className="grid grid-cols-4 gap-3">
          {(["A", "B", "unstable", "unusable"] as const).map((g) => (
            <div key={g} className="rounded-xl border border-stone-200 bg-white p-4 text-center">
              <p className="text-xs uppercase text-stone-500">{g}-grade</p>
              <p className="text-2xl font-bold text-stone-900">{audit.gradeDistribution[g]}</p>
              <p className="text-xs text-stone-500">{pct(audit.gradeDistribution[g], c.totalCatalogProducts)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-100 px-4 py-3 font-semibold text-stone-800">
          Category health
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Catalog</th>
                <th className="px-4 py-2">Verified</th>
                <th className="px-4 py-2">Prod-usable</th>
                <th className="px-4 py-2">Stale</th>
                <th className="px-4 py-2">Avg retailers</th>
                <th className="px-4 py-2">Scrape</th>
                <th className="px-4 py-2">Match</th>
              </tr>
            </thead>
            <tbody>
              {audit.categories.map((cat) => (
                <tr key={cat.category} className="border-t border-stone-100">
                  <td className="px-4 py-2 font-medium">{cat.category}</td>
                  <td className="px-4 py-2">{cat.productCount}</td>
                  <td className="px-4 py-2">{fmtRate(cat.verifiedRate)}</td>
                  <td className="px-4 py-2">
                    {audit.coverage.byCategory.find((x) => x.category === cat.category)?.productionUsable ?? 0}
                  </td>
                  <td className="px-4 py-2">
                    {audit.coverage.byCategory.find((x) => x.category === cat.category)?.stale ?? 0}
                  </td>
                  <td className="px-4 py-2">{cat.avgRetailerDiversity.toFixed(1)}</td>
                  <td className="px-4 py-2">{cat.scrapeQuality}</td>
                  <td className="px-4 py-2">{cat.matchingQuality}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-100 px-4 py-3 font-semibold text-stone-800">
          Retailer reliability matrix
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                <th className="px-4 py-2">Retailer</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Trust</th>
                <th className="px-4 py-2">Scrape</th>
                <th className="px-4 py-2">Parser</th>
                <th className="px-4 py-2">Image</th>
                <th className="px-4 py-2">Verified quotes</th>
                <th className="px-4 py-2">Latency</th>
                <th className="px-4 py-2">Reject</th>
              </tr>
            </thead>
            <tbody>
              {audit.retailers.map((m) => (
                <tr key={m.retailerId} className="border-t border-stone-100">
                  <td className="px-4 py-2 font-medium">{m.retailerId}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={m.classification} />
                  </td>
                  <td className="px-4 py-2">{m.trustScore.toFixed(2)}</td>
                  <td className="px-4 py-2">{fmtRate(m.scrapeSuccessRate)}</td>
                  <td className="px-4 py-2">{fmtRate(m.parserStabilityScore)}</td>
                  <td className="px-4 py-2">{fmtRate(m.imageExtractionRate)}</td>
                  <td className="px-4 py-2">{m.verifiedQuoteCount}</td>
                  <td className="px-4 py-2">
                    {m.avgLatencyMs != null ? `${Math.round(m.avgLatencyMs)}ms` : "—"}
                  </td>
                  <td className="px-4 py-2">{fmtRate(m.offerRejectionRate)}</td>
                </tr>
              ))}
              {!audit.retailers.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-stone-500">
                    No retailer data — run index or search enrichment to populate metrics.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <ProductList title="Top demo-ready products" products={audit.top20} />
        <ProductList title="Worst / problematic products" products={audit.worst20} worst />
      </div>

      <section className="mt-8 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
        <h2 className="mb-2 font-semibold text-stone-900">Exact matching snapshot</h2>
        <p>
          UPC coverage: {audit.exactMatching.productsWithUpc}/{c.totalCatalogProducts} ·
          Exact match rate: {audit.exactMatching.exactMatchRate != null ? fmtRate(audit.exactMatching.exactMatchRate) : "—"} ·
          Avg confidence: {audit.exactMatching.avgMatchConfidence?.toFixed(2) ?? "—"}
        </p>
        <p className="mt-2 text-xs text-stone-500">
          Full report: <code>npm run audit:ops -- --write</code> → docs/OPERATIONAL_AUDIT.md
        </p>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-stone-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "production-ready": "bg-emerald-100 text-emerald-800",
    "usable-with-caveats": "bg-sky-100 text-sky-800",
    unstable: "bg-amber-100 text-amber-800",
    unusable: "bg-red-100 text-red-800",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-stone-100"}`}>
      {status}
    </span>
  );
}

function ProductList({
  title,
  products,
  worst,
}: {
  title: string;
  products: { catalogId: string; grade: string; score: number; verifiedCount: number; issues: string[] }[];
  worst?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <h2 className="border-b border-stone-100 px-4 py-3 font-semibold text-stone-800">{title}</h2>
      {!products.length ?
        <p className="px-4 py-6 text-sm text-stone-500">No products in this tier yet.</p>
      : <ul className="divide-y divide-stone-100 text-sm">
          {products.map((p, i) => (
            <li key={p.catalogId} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-stone-800">
                  {i + 1}. {p.catalogId}
                </span>
                <span className="text-xs text-stone-500">
                  {p.grade} · {p.score} · {p.verifiedCount} verified
                </span>
              </div>
              {p.issues.length > 0 && (
                <p className={`mt-1 text-xs ${worst ? "text-red-700" : "text-stone-500"}`}>
                  {p.issues.join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      }
    </section>
  );
}
