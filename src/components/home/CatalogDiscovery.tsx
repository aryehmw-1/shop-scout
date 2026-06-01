import Link from "next/link";
import { Search, TrendingUp, Store } from "lucide-react";
import { queryDemoCatalog } from "@/lib/demo-commerce/store";
import { filterPublicDemoCatalog } from "@/lib/retailers/public-retailers";
import { getRetailerMeta } from "@/lib/retailers/meta";
import type { RetailerId } from "@/lib/types";

export function CatalogDiscovery() {
  const catalog = filterPublicDemoCatalog(queryDemoCatalog({ validOnly: true }));
  const topRetailers = catalog.retailers.slice(0, 12);
  const categories = catalog.categories.slice(0, 8);

  const trending = [...catalog.products]
    .sort((a, b) => new Date(b.scraped_at).getTime() - new Date(a.scraped_at).getTime())
    .slice(0, 6);

  return (
    <section className="border-t border-cream-200 bg-white px-4 py-12 sm:px-6 lg:px-12">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="rounded-2xl border border-sage-200 bg-gradient-to-br from-sage-50 to-cream-50 p-6 sm:p-8">
          <h2 className="font-homy text-xl font-bold text-ink-900 sm:text-2xl">
            Search the catalog
          </h2>
          <p className="mt-2 max-w-xl text-ink-600">
            {catalog.total.toLocaleString()} products indexed with real prices, images, and
            outbound links.
          </p>
          <form action="/demo" method="get" className="mt-5 flex max-w-lg gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
                size={18}
              />
              <input
                name="q"
                type="search"
                placeholder="Search milk, headphones, shampoo…"
                className="w-full rounded-xl border border-cream-300 py-3 pl-10 pr-3 text-sm"
              />
            </div>
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-sage-700 px-5 py-3 text-sm font-semibold text-white hover:bg-sage-800"
            >
              Search
            </button>
          </form>
        </div>

        {categories.length > 0 && (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-ink-500">Categories</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Link
                  key={cat}
                  href={`/demo?category=${encodeURIComponent(cat)}`}
                  className="rounded-full border border-cream-300 bg-cream-50 px-4 py-2 text-sm font-medium text-ink-800 hover:border-sage-400 hover:bg-sage-50"
                >
                  {cat}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-500">
            <Store size={16} />
            Shop by retailer
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {topRetailers.map((r) => {
              const meta = getRetailerMeta(r as RetailerId);
              return (
                <Link
                  key={r}
                  href={`/demo?retailer=${encodeURIComponent(r)}`}
                  className="rounded-xl border border-cream-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 shadow-sm hover:border-sage-300"
                >
                  {meta?.name ?? r}
                </Link>
              );
            })}
          </div>
        </div>

        {trending.length > 0 && (
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-500">
              <TrendingUp size={16} />
              Recently indexed
            </h3>
            <ul className="mt-3 divide-y divide-cream-200 rounded-2xl border border-cream-200 bg-cream-50/50">
              {trending.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/demo/products/${encodeURIComponent(p.id)}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-white"
                  >
                    <span className="line-clamp-1 text-sm font-medium text-ink-900">
                      {p.title}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-sage-700">
                      {p.retailer}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
