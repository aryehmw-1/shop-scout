import Link from "next/link";
import { computeInventoryHealth } from "@/lib/inventory/inventory-health";
import { computePersistedProductsReport } from "@/lib/inventory/persisted-products-report";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export default async function InventoryDashboardPage() {
  const inv = await computeInventoryHealth();
  const persisted = await computePersistedProductsReport();
  const c = inv.operational.coverage;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Inventory health</h1>
          <p className="text-sm text-stone-500">
            Canonical graph + verified offers · {new Date(inv.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/admin/quality" className="text-sage-700 hover:underline">
            Operational →
          </Link>
          <Link href="/admin/links" className="text-sage-700 hover:underline">
            Link ingestion →
          </Link>
        </div>
      </div>

      <section className="mb-8 rounded-xl border border-sage-200 bg-sage-50 p-4">
        <h2 className="mb-3 font-semibold text-stone-800">Flagship inventory (production target)</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Flagship products" value={inv.flagship.count} />
          <Stat label="Flagship active verified" value={inv.flagship.activeVerified} warn={inv.flagship.activeVerified === 0} />
          <Stat label="Flagship prod-usable" value={inv.flagship.productionUsable} warn={inv.flagship.productionUsable === 0} />
          <Stat label="Flagship 2+ retailer overlap" value={inv.flagship.overlap2Plus} />
        </div>
        <p className="mt-2 text-xs text-stone-600">
          UPC-heavy grocery/household only · apparel/shoes deprioritized for indexing
        </p>
      </section>

      <section className="mb-8 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-stone-800">Trust gates &amp; data quality</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Freshness failures (expired %)" value={pct(inv.trustMetrics.freshnessFailurePct)} warn={inv.trustMetrics.freshnessFailurePct > 50} />
          <Stat label="Stale active quotes" value={pct(inv.stalePct)} warn={inv.stalePct > 20} />
          <Stat label="Low match confidence" value={pct(inv.trustMetrics.lowConfidencePct)} />
          <Stat label="Consumer trust pass rate" value={pct(inv.trustMetrics.consumerTrustPassPct)} warn={inv.trustMetrics.consumerTrustPassPct < 80} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {inv.trustMetrics.matchConfidenceBuckets.map((b) => (
            <div key={b.bucket} className="rounded-lg bg-stone-50 p-2 text-center text-sm">
              <p className="text-xs text-stone-500">{b.bucket}</p>
              <p className="font-bold">{b.count} ({pct(b.pct)})</p>
            </div>
          ))}
        </div>
      </section>

      {inv.retailerQuality.length > 0 && (
        <section className="mb-8 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <h2 className="border-b border-stone-100 px-4 py-3 font-semibold">
            Retailer success rates (from last index runs)
          </h2>
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                <th className="px-4 py-2">Retailer</th>
                <th className="px-4 py-2">Fetch OK</th>
                <th className="px-4 py-2">Parser OK</th>
                <th className="px-4 py-2">Persist OK</th>
                <th className="px-4 py-2">Trust</th>
              </tr>
            </thead>
            <tbody>
              {inv.retailerQuality.map((r) => (
                <tr key={r.retailerId} className="border-t border-stone-100">
                  <td className="px-4 py-2 font-medium">{r.retailerId}</td>
                  <td className="px-4 py-2">{pct(r.fetchSuccessPct)}</td>
                  <td className="px-4 py-2">{pct(r.parserSuccessPct)}</td>
                  <td className="px-4 py-2">{pct(r.persistSuccessPct)}</td>
                  <td className="px-4 py-2">{r.trustScore.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Curated catalog (canonical IDs)" value={inv.inMemoryCatalogSize} />
        <Stat label="DB canonical products" value={inv.canonicalProductCount} />
        <Stat
          label="Production-usable"
          value={`${inv.productionUsable} (${pct(c.pctProductionUsable)})`}
          warn={inv.productionUsable === 0}
        />
        <Stat label="Active verified quotes" value={inv.activeVerifiedQuotes} warn={inv.activeVerifiedQuotes === 0} />
        <Stat label="Expired verified (recoverable)" value={inv.expiredVerifiedQuotes} />
        <Stat label="Estimate-only quotes" value={inv.estimateQuoteRows} />
        <Stat label="Unique retailer PDPs observed" value={inv.uniqueRetailerPdps} />
        <Stat label="PDPs linked to canonical product" value={inv.linkedRetailerPdps} />
        <Stat label="Product identifiers (graph edges)" value={inv.productIdentifierCount} />
        <Stat label="2+ retailer overlap (active)" value={`${inv.productsWith2PlusRetailers} (${pct(inv.retailerOverlapPct)})`} />
        <Stat label="3+ retailer overlap" value={inv.productsWith3PlusRetailers} />
        <Stat label="Inventory freshness" value={inv.activeVerifiedQuotes ? pct(inv.freshnessPct) : "—"} />
      </section>

      <section className="mb-8 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-stone-800">Quality grades</h2>
        <div className="grid grid-cols-4 gap-3">
          {(["A", "B", "unstable", "unusable"] as const).map((g) => (
            <div key={g} className="rounded-lg bg-stone-50 p-3 text-center">
              <p className="text-xs uppercase text-stone-500">{g}</p>
              <p className="text-xl font-bold">{inv.gradeDistribution[g]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-100 px-4 py-3 font-semibold">Category coverage</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Canonical</th>
                <th className="px-4 py-2">Active verified</th>
                <th className="px-4 py-2">Expired</th>
                <th className="px-4 py-2">Est. only</th>
                <th className="px-4 py-2">2+ retailers</th>
                <th className="px-4 py-2">Prod-usable</th>
              </tr>
            </thead>
            <tbody>
              {inv.byCategory.map((row) => (
                <tr key={row.category} className="border-t border-stone-100">
                  <td className="px-4 py-2 font-medium">{row.category}</td>
                  <td className="px-4 py-2">{row.canonicalCount}</td>
                  <td className="px-4 py-2">{row.activeVerified}</td>
                  <td className="px-4 py-2">{row.expiredVerified}</td>
                  <td className="px-4 py-2">{row.estimateOnly}</td>
                  <td className="px-4 py-2">{row.overlap2Plus}</td>
                  <td className="px-4 py-2">{row.productionUsable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-100 px-4 py-3 font-semibold">
          Verified offers by retailer
        </h2>
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-2">Retailer</th>
              <th className="px-4 py-2">Total verified rows</th>
              <th className="px-4 py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {inv.byRetailerVerified.map((r) => (
              <tr key={r.retailerId} className="border-t border-stone-100">
                <td className="px-4 py-2 font-medium">{r.retailerId}</td>
                <td className="px-4 py-2">{r.total}</td>
                <td className="px-4 py-2">{r.active}</td>
              </tr>
            ))}
            {!inv.byRetailerVerified.length && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-stone-500">
                  No verified retailer rows yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {persisted.products.length > 0 && (
        <section className="mb-8 overflow-hidden rounded-xl border border-sage-300 bg-sage-50/40 shadow-sm">
          <h2 className="border-b border-sage-200 px-4 py-3 font-semibold text-sage-900">
            Persisted verified products ({persisted.uniqueProducts})
          </h2>
          <p className="px-4 py-2 text-xs text-stone-600">
            Manual QA target · run <code>npm run audit:persisted -- --write</code> for full report
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/80 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Retailers</th>
                  <th className="px-4 py-2">Price range</th>
                  <th className="px-4 py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {persisted.products.slice(0, 20).map((p) => {
                  const suspicious = p.quotes.some((q) => q.bulkSuspicion);
                  return (
                    <tr key={p.catalogId} className="border-t border-sage-100">
                      <td className="px-4 py-2">
                        <span className="font-medium">{p.title}</span>
                        <span className="block text-xs text-stone-500">{p.catalogId}</span>
                      </td>
                      <td className="px-4 py-2">{p.category}</td>
                      <td className="px-4 py-2">{p.retailers.join(", ")}</td>
                      <td className="px-4 py-2">
                        ${p.minPrice.toFixed(2)}–${p.maxPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {suspicious ? (
                          <span className="text-amber-700">review bulk/ratio</span>
                        ) : (
                          <span className="text-sage-700">ok</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-100 px-4 py-3 font-semibold">
          Retailer ingestion model (core 5)
        </h2>
        <p className="px-4 py-2 text-xs text-stone-500">
          We do NOT ingest full retailer catalogs. Curated canonical products → selective PDP/search enrichment.
        </p>
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-2">Retailer</th>
              <th className="px-4 py-2">Mode</th>
              <th className="px-4 py-2">Nightly</th>
              <th className="px-4 py-2">Search</th>
              <th className="px-4 py-2">Link paste</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {inv.ingestionProfiles.map((p) => (
              <tr key={p.retailerId} className="border-t border-stone-100">
                <td className="px-4 py-2 font-medium">{p.retailerId}</td>
                <td className="px-4 py-2">{p.mode}</td>
                <td className="px-4 py-2">{p.nightlyIndex ? "✓" : "—"}</td>
                <td className="px-4 py-2">{p.searchTriggered ? "✓" : "—"}</td>
                <td className="px-4 py-2">{p.userLinkTriggered ? "✓" : "—"}</td>
                <td className="px-4 py-2 text-stone-600">{p.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-6 text-xs text-stone-500">
        Strategy: <code>docs/INVENTORY_STRATEGY.md</code> · Data quality:{" "}
        <code>npm run audit:data-quality</code> · Persisted QA:{" "}
        <code>npm run audit:persisted -- --write</code> · Search debug:{" "}
        <code>npm run debug:search -- &quot;mens joggers&quot; --write</code> · Refresh:{" "}
        <code>npm run phase0:refresh</code>
      </p>
    </main>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        warn ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-stone-900">{value}</p>
    </div>
  );
}
