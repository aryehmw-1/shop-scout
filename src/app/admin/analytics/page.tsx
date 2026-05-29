import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { runQualityChecks } from "@/lib/monitoring/quality-alerts";

export const dynamic = "force-dynamic";

const EVENT_KINDS = [
  "search_performed",
  "search_first_results",
  "offer_click",
  "best_deal_click",
  "offer_save",
  "feedback_submitted",
  "compare_view",
  "enrichment_completed",
] as const;

export default async function AnalyticsDashboardPage() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [events, alerts] = await Promise.all([
    prisma.learningEvent.groupBy({
      by: ["kind"],
      _count: { id: true },
      where: { kind: { in: [...EVENT_KINDS] }, createdAt: { gte: since } },
    }),
    runQualityChecks(),
  ]);

  const counts = Object.fromEntries(
    events.map((e) => [e.kind, e._count.id]),
  ) as Record<string, number>;

  const searches = counts.search_performed ?? 0;
  const clicks = (counts.offer_click ?? 0) + (counts.best_deal_click ?? 0);
  const bestDealClicks = counts.best_deal_click ?? 0;
  const ctr = searches > 0 ? clicks / searches : 0;
  const bestDealRate = clicks > 0 ? bestDealClicks / clicks : 0;

  const recentSearches = await prisma.learningEvent.findMany({
    where: { kind: "search_performed", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { payloadJson: true, createdAt: true },
  });

  const topQueries = new Map<string, number>();
  for (const row of recentSearches) {
    try {
      const p = JSON.parse(row.payloadJson) as { query?: string };
      if (p.query) topQueries.set(p.query, (topQueries.get(p.query) ?? 0) + 1);
    } catch {
      /* skip */
    }
  }

  const retailerClicks = new Map<string, number>();
  const clickRows = await prisma.learningEvent.findMany({
    where: {
      kind: { in: ["offer_click", "best_deal_click"] },
      createdAt: { gte: since },
    },
    take: 500,
    select: { payloadJson: true },
  });
  for (const row of clickRows) {
    try {
      const p = JSON.parse(row.payloadJson) as { retailer?: string };
      if (p.retailer) {
        retailerClicks.set(p.retailer, (retailerClicks.get(p.retailer) ?? 0) + 1);
      }
    } catch {
      /* skip */
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-stone-900">Product analytics</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/quality" className="text-sage-700 hover:underline">
            Quality →
          </Link>
          <Link href="/compare" className="text-sage-700 hover:underline">
            Compare page →
          </Link>
        </div>
      </div>

      <p className="mb-6 text-sm text-stone-600">Last 7 days · stored in LearningEvent</p>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Searches" value={searches} />
        <Stat label="Outbound clicks" value={clicks} />
        <Stat label="Search → click" value={`${Math.round(ctr * 100)}%`} />
        <Stat label="Best deal CTR" value={`${Math.round(bestDealRate * 100)}%`} />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-stone-800">Event counts</h2>
          <ul className="space-y-1 text-sm">
            {EVENT_KINDS.map((k) => (
              <li key={k} className="flex justify-between text-stone-600">
                <span>{k}</span>
                <span className="font-medium">{counts[k] ?? 0}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-stone-800">Retailer click distribution</h2>
          {retailerClicks.size === 0 ?
            <p className="text-sm text-stone-500">No clicks yet</p>
          : <ul className="space-y-1 text-sm">
              {[...retailerClicks.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([r, n]) => (
                  <li key={r} className="flex justify-between text-stone-600">
                    <span>{r}</span>
                    <span className="font-medium">{n}</span>
                  </li>
                ))}
            </ul>
          }
        </section>
      </div>

      <section className="mb-8 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-stone-800">Recent search queries</h2>
        {topQueries.size === 0 ?
          <p className="text-sm text-stone-500">No searches yet</p>
        : <ul className="flex flex-wrap gap-2">
            {[...topQueries.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12)
              .map(([q, n]) => (
                <li
                  key={q}
                  className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700"
                >
                  {q} <span className="text-stone-400">×{n}</span>
                </li>
              ))}
          </ul>
        }
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-stone-800">Quality alerts</h2>
        {alerts.length === 0 ?
          <p className="text-sm text-emerald-700">No active alerts</p>
        : <ul className="space-y-2">
            {alerts.map((a) => (
              <li
                key={a.id}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  a.severity === "critical" ?
                    "border-red-200 bg-red-50 text-red-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                <p className="font-medium">{a.title}</p>
                <p className="text-xs opacity-80">{a.detail}</p>
              </li>
            ))}
          </ul>
        }
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-900">{value}</p>
    </div>
  );
}
