import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { getEnrichmentCacheStats } from "@/lib/demo-commerce/amazon-enrichment/cache";
import { isAmazonEnrichmentAvailable } from "@/lib/demo-commerce/amazon-enrichment/enrich";
import { assessCanonicalCatalogHealth } from "@/lib/demo-commerce/canonical/catalog-health";
import { queryCanonicalCatalog, hasCanonicalCatalog } from "@/lib/demo-commerce/canonical/store";
import { queryDemoCatalog } from "@/lib/demo-commerce/store";

export const dynamic = "force-dynamic";

interface IngestReport {
  totalProducts?: number;
  preValidationCount?: number;
  postValidationCount?: number;
  rejectedValidation?: number;
  completedAt?: string;
  retailerScores?: Array<{
    retailer: string;
    collected: number;
    published: number;
    compatibilityScore: number;
  }>;
  skippedRetailers?: string[];
}

export default function InventoryStatusPage() {
  const catalogHealth = assessCanonicalCatalogHealth();
  const catalog = hasCanonicalCatalog() ? queryCanonicalCatalog() : queryDemoCatalog();
  const enrichCache = getEnrichmentCacheStats();
  const paapiReady = isAmazonEnrichmentAvailable();
  const reportPath = join(process.cwd(), "data", "ingest-report.json");
  let report: IngestReport | null = null;
  if (existsSync(reportPath)) {
    try {
      report = JSON.parse(readFileSync(reportPath, "utf8")) as IngestReport;
    } catch {
      report = null;
    }
  }

  return (
    
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-12">
          <Link href="/inventory" className="text-sm font-semibold text-sage-700 hover:underline">
            ← Back to inventory
          </Link>
          <h1 className="font-homy mt-4 text-3xl font-bold text-ink-900">Inventory status</h1>
          <p className="mt-2 text-ink-600">
            Retailer compatibility and inventory health after the last bulk run.
          </p>

          {catalogHealth.alerts.length > 0 && (
            <div
              className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
                catalogHealth.demoReady ?
                  "border-amber-200 bg-amber-50 text-amber-950"
                : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              <p className="font-semibold">Inventory status: {catalogHealth.status}</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {catalogHealth.alerts.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={hasCanonicalCatalog() ? "Published (validated)" : "Published"}
              value={String(catalogHealth.publishedCount || catalog.total)}
            />
            {hasCanonicalCatalog() && (
              <Stat label="Raw in file" value={String(catalogHealth.rawProductCount)} />
            )}
            <Stat
              label="Retailers"
              value={String(catalog.retailers.length)}
            />
            <Stat
              label="Amazon PA-API"
              value={paapiReady ? "Configured" : "Missing keys"}
            />
            <Stat
              label="Enrichment cache"
              value={`${enrichCache.accepted}/${enrichCache.total}`}
            />
          </div>

          {report?.retailerScores && report.retailerScores.length > 0 ? (
            <div className="mt-10 overflow-x-auto rounded-2xl border border-cream-200">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="bg-cream-50 text-xs font-bold uppercase text-ink-500">
                  <tr>
                    <th className="px-4 py-3">Retailer</th>
                    <th className="px-4 py-3">Collected</th>
                    <th className="px-4 py-3">Published</th>
                    <th className="px-4 py-3">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {report.retailerScores.map((row) => (
                    <tr key={row.retailer} className="bg-white">
                      <td className="px-4 py-3 font-medium">{row.retailer}</td>
                      <td className="px-4 py-3">{row.collected}</td>
                      <td className="px-4 py-3">{row.published}</td>
                      <td className="px-4 py-3">
                        <ScoreBar score={row.compatibilityScore} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-8 rounded-xl border border-dashed border-cream-300 p-6 text-ink-600">
              No ingest report yet. Run{" "}
              <code className="rounded bg-cream-100 px-1">npm run demo:bulk</code> locally, then
              commit <code className="rounded bg-cream-100 px-1">data/products.json</code> and{" "}
              <code className="rounded bg-cream-100 px-1">data/ingest-report.json</code>.
            </p>
          )}

          {report && (
            <pre className="mt-8 overflow-x-auto rounded-xl bg-ink-950 p-4 text-xs text-cream-100">
              {JSON.stringify(
                {
                  preValidationCount: report.preValidationCount,
                  postValidationCount: report.postValidationCount,
                  rejectedValidation: report.rejectedValidation,
                  skippedRetailers: report.skippedRetailers,
                },
                null,
                2,
              )}
            </pre>
          )}
        </div>
        <Footer />
      </main>
    
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-cream-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink-900">{value}</p>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-cream-200">
        <div
          className="h-full rounded-full bg-sage-600"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-ink-600">{pct}%</span>
    </div>
  );
}
