import Link from "next/link";
import { getDashboardData, type CountPair, type TimePoint } from "@/lib/analytics/dashboard-data";

export const dynamic = "force-dynamic";

export default async function AnalyticsDashboardPage() {
  const d = await getDashboardData();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Analytics &amp; user intelligence</h1>
          <p className="text-sm text-stone-500">Live from Postgres · admin only</p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/quality" className="text-sage-700 hover:underline">Quality →</Link>
          <Link href="/admin/inventory" className="text-sage-700 hover:underline">Inventory →</Link>
        </div>
      </div>

      {/* OVERVIEW */}
      <Section title="Overview">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Total searches" value={d.overview.totalSearches} />
          <Stat label="Today" value={d.overview.searchesToday} />
          <Stat label="This week" value={d.overview.searchesWeek} />
          <Stat label="This month" value={d.overview.searchesMonth} />
          <Stat label="Product requests" value={d.overview.productRequests} />
          <Stat label="Unique visitors" value={d.overview.uniqueVisitors} />
          <Stat label="Returning" value={d.overview.returningVisitors} />
          <Stat label="New" value={d.overview.newVisitors} />
          <Stat label="Product clicks" value={d.overview.productClicks} />
          <Stat label="Retailer clicks" value={d.overview.retailerClicks} />
        </div>
      </Section>

      {/* SEARCH INSIGHTS */}
      <Section title="Search insights">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Search volume — last 30 days"><BarChart points={d.search.volumeDaily} /></Card>
          <Card title="Weekly — last 12 weeks"><BarChart points={d.search.volumeWeekly} /></Card>
          <Card title="Monthly — last 12 months"><BarChart points={d.search.volumeMonthly} /></Card>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title={`Top search terms (top ${d.search.topTerms.length})`}>
            <RankList items={d.search.topTerms} max={100} scroll />
          </Card>
          <div className="grid gap-6">
            <Card title="Top today"><RankList items={d.search.topToday} max={10} /></Card>
            <Card title="Top this week"><RankList items={d.search.topWeek} max={10} /></Card>
          </div>
        </div>
        <div className="mt-6">
          <Card title="Searches with no results" accent="amber">
            <RankList items={d.search.noResults} max={50} scroll empty="No zero-result searches yet 🎉" />
          </Card>
        </div>
      </Section>

      {/* MISSING PRODUCTS */}
      <Section title="Missing products (demand we don't serve)">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Most requested (request form)"><RankList items={d.missing.requested} max={25} scroll /></Card>
          <Card title="Most searched but missing"><RankList items={d.missing.searchedMissing} max={25} scroll /></Card>
          <Card title="Missing by category"><RankList items={d.missing.byCategory} max={25} /></Card>
        </div>
      </Section>

      {/* PRODUCT PERFORMANCE */}
      <Section title="Product performance">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Product CTR (clicks/search)" value={`${d.products.productCtrPct}%`} />
          <Stat label="Retailer CTR (clicks/search)" value={`${d.products.retailerCtrPct}%`} />
          <Stat label="Distinct retailers clicked" value={d.products.topRetailers.length} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Most-clicked products"><RankList items={d.products.topProducts} max={25} scroll /></Card>
          <Card title="Most-clicked retailers + CTR">
            {d.products.retailerCtr.length === 0 ? (
              <Empty>No retailer clicks yet</Empty>
            ) : (
              <ul className="space-y-1 text-sm">
                {d.products.retailerCtr.map((r) => (
                  <li key={r.retailer} className="flex justify-between text-stone-600">
                    <span>{r.retailer}</span>
                    <span className="font-medium">{r.clicks} · {r.ctrPct}%</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Section>

      {/* USER BEHAVIOR */}
      <Section title="User behavior">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Returning visitors" value={d.users.returning} />
          <Stat label="New visitors" value={d.users.new} />
          <Stat label="Searches / known user" value={d.users.searchesPerUser} />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Top landing pages"><RankList items={d.users.topLandingPages} max={15} scroll /></Card>
          <Card title="Product request trend (30d)"><BarChart points={d.users.requestTrendDaily} /></Card>
          <Card title="Retailer click trend (30d)"><BarChart points={d.users.retailerClickTrendDaily} /></Card>
        </div>
      </Section>
    </main>
  );
}

// ── UI primitives ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h2>
      {children}
    </section>
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

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: "amber" }) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${accent === "amber" ? "border-amber-200" : "border-stone-200"}`}>
      <h3 className="mb-3 font-semibold text-stone-800">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-stone-400">{children}</p>;
}

function RankList({
  items,
  max,
  scroll,
  empty = "No data yet",
}: {
  items: CountPair[];
  max: number;
  scroll?: boolean;
  empty?: string;
}) {
  if (!items.length) return <Empty>{empty}</Empty>;
  const top = items.slice(0, max);
  const peak = Math.max(...top.map((i) => i.count), 1);
  return (
    <ol className={`space-y-1.5 text-sm ${scroll ? "max-h-80 overflow-y-auto pr-1" : ""}`}>
      {top.map((it, i) => (
        <li key={`${it.label}-${i}`} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right text-xs text-stone-400">{i + 1}</span>
          <span className="relative flex-1 truncate" title={it.label}>
            <span
              className="absolute inset-y-0 left-0 -z-0 rounded bg-sage-100"
              style={{ width: `${(it.count / peak) * 100}%` }}
            />
            <span className="relative z-10 px-1 text-stone-700">{it.label}</span>
          </span>
          <span className="shrink-0 font-medium text-stone-900">{it.count}</span>
        </li>
      ))}
    </ol>
  );
}

function BarChart({ points }: { points: TimePoint[] }) {
  if (!points.length) return <Empty>No data yet</Empty>;
  const peak = Math.max(...points.map((p) => p.count), 1);
  const W = 320;
  const H = 120;
  const gap = 2;
  const bw = Math.max((W - gap * (points.length - 1)) / points.length, 1);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="bar chart">
        {points.map((p, i) => {
          const h = (p.count / peak) * (H - 16);
          return (
            <rect
              key={p.bucket}
              x={i * (bw + gap)}
              y={H - h}
              width={bw}
              height={h}
              rx={1.5}
              style={{ fill: "var(--sage-400)" }}
            >
              <title>{`${p.bucket}: ${p.count}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-stone-400">
        <span>{points[0]?.bucket}</span>
        <span>peak {peak}</span>
        <span>{points[points.length - 1]?.bucket}</span>
      </div>
    </div>
  );
}
