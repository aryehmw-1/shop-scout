"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { DemoCatalogResult } from "@/lib/demo-commerce/types";
import { DemoProductCard } from "./DemoProductCard";

function CatalogSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-2xl border border-cream-200 bg-white"
        >
          <div className="aspect-square bg-cream-200" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 rounded bg-cream-200" />
            <div className="h-3 w-1/2 rounded bg-cream-100" />
            <div className="h-6 w-20 rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DemoCatalogClient({ initial }: { initial: DemoCatalogResult }) {
  const [q, setQ] = useState("");
  const [retailer, setRetailer] = useState("");
  const [category, setCategory] = useState("");
  const deferredQ = useDeferredValue(q.trim());

  const filtered = useMemo(() => {
    let products = initial.products;
    if (retailer) products = products.filter((p) => p.retailer === retailer);
    if (category) {
      products = products.filter(
        (p) => p.category?.toLowerCase() === category.toLowerCase(),
      );
    }
    if (deferredQ) {
      const needle = deferredQ.toLowerCase();
      products = products.filter(
        (p) =>
          p.title.toLowerCase().includes(needle) ||
          p.brand?.toLowerCase().includes(needle) ||
          p.retailer.toLowerCase().includes(needle) ||
          p.category?.toLowerCase().includes(needle),
      );
    }
    return products;
  }, [initial.products, deferredQ, retailer, category]);

  const isFiltering = q.trim() !== deferredQ;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-cream-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm">
          <span className="font-semibold text-ink-700">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={18} />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Title, brand, retailer…"
              className="w-full rounded-xl border border-cream-300 py-2.5 pl-10 pr-3 text-sm"
            />
          </div>
        </label>
        <label className="flex min-w-[140px] flex-col gap-1 text-sm">
          <span className="font-semibold text-ink-700">Retailer</span>
          <select
            value={retailer}
            onChange={(e) => setRetailer(e.target.value)}
            className="rounded-xl border border-cream-300 px-3 py-2.5 text-sm"
          >
            <option value="">All</option>
            {initial.retailers.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[140px] flex-col gap-1 text-sm">
          <span className="font-semibold text-ink-700">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-cream-300 px-3 py-2.5 text-sm"
          >
            <option value="">All</option>
            {initial.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-sm text-ink-600">
        Showing {filtered.length} trusted product{filtered.length === 1 ? "" : "s"}
        {initial.updatedAt ? ` · updated ${new Date(initial.updatedAt).toLocaleString()}` : ""}
      </p>

      {isFiltering ?
        <CatalogSkeleton />
      : filtered.length === 0 ?
        <p className="rounded-xl border border-dashed border-cream-300 bg-cream-50 p-8 text-center text-ink-600">
          No quality-checked products match. Run{" "}
          <code className="rounded bg-cream-200 px-1">npm run demo:bulk</code> with retailer
          adapters (requires network), or{" "}
          <code className="rounded bg-cream-200 px-1">npm run demo:quality</code> to filter the
          catalog.
        </p>
      : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <DemoProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
