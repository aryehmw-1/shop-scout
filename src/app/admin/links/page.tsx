import Link from "next/link";

const RETAILER_MATRIX = [
  { retailer: "Amazon", pdp: "✅", ids: "ASIN", exact: "Strong", api: "PA-API fallback", notes: "Best demo retailer" },
  { retailer: "Walmart", pdp: "⚠️", ids: "Item ID", exact: "Good", api: "Scrape + proxy", notes: "Needs residential proxy" },
  { retailer: "Target", pdp: "⚠️", ids: "TCIN partial", exact: "Moderate", api: "Scrape + proxy", notes: "Anti-bot heavy" },
  { retailer: "Costco", pdp: "⚠️", ids: "Partial", exact: "Moderate", api: "Hybrid", notes: "Often blocked" },
  { retailer: "Kroger", pdp: "⚠️", ids: "Limited", exact: "Weak", api: "Scrape + proxy", notes: "Proxy required" },
  { retailer: "Other", pdp: "❌", ids: "Slug only", exact: "None", api: "N/A", notes: "Title guess — similar mode only" },
];

export default function LinkIngestionAdminPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">Pasted-link ingestion</h1>
        <Link href="/admin/quality" className="text-sm text-sage-700 hover:underline">
          ← Operational dashboard
        </Link>
      </div>

      <p className="mb-6 text-sm text-stone-600">
        Pipeline docs: <code>docs/LINK_INGESTION_AUDIT.md</code> · Audit:{" "}
        <code>npm run audit:links</code>
      </p>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-100 px-4 py-3 font-semibold">
          Retailer support matrix
        </h2>
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th className="px-4 py-2">Retailer</th>
              <th className="px-4 py-2">PDP fetch</th>
              <th className="px-4 py-2">IDs</th>
              <th className="px-4 py-2">Exact match</th>
              <th className="px-4 py-2">API/scrape</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {RETAILER_MATRIX.map((r) => (
              <tr key={r.retailer} className="border-t border-stone-100">
                <td className="px-4 py-2 font-medium">{r.retailer}</td>
                <td className="px-4 py-2">{r.pdp}</td>
                <td className="px-4 py-2">{r.ids}</td>
                <td className="px-4 py-2">{r.exact}</td>
                <td className="px-4 py-2">{r.api}</td>
                <td className="px-4 py-2 text-stone-600">{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
