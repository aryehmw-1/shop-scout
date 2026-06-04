"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { CanonicalCatalogResult } from "@/lib/demo-commerce/canonical/types";
import { CanonicalProductCard } from "./CanonicalProductCard";

function CatalogSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-cream-200 bg-white">
          <div className="aspect-square bg-cream-200" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 rounded bg-cream-200" />
            <div className="h-6 w-24 rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CanonicalCatalogClient({ initial }: { initial: CanonicalCatalogResult }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const deferredQ = useDeferredValue(q.trim());
  const isFiltering = q.trim() !== deferredQ;

  const filtered = useMemo(() => {
    let products = initial.products;
    if (category) {
      products = products.filter(
        (p) => p.canonical_category.toLowerCase() === category.toLowerCase(),
      );
    }
    if (deferredQ) {
      const needle = deferredQ.toLowerCase();
      products = products.filter(
        (p) =>
          p.canonical_title.toLowerCase().includes(needle) ||
          p.brand?.toLowerCase().includes(needle) ||
          p.normalized_keywords.some((k) => k.includes(needle)),
      );
    }
    return products;
  }, [initial.products, deferredQ, category]);

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
              placeholder="Product or brand…"
              className="w-full rounded-xl border border-cream-300 py-2.5 pl-10 pr-3 text-sm"
            />
          </div>
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
        {filtered.length} product{filtered.length === 1 ? "" : "s"} with multi-store compare
        pricing
        {initial.updatedAt ?
          ` · updated ${new Date(initial.updatedAt).toLocaleString()}`
        : ""}
      </p>

      {isFiltering ?
        <CatalogSkeleton />
      : filtered.length === 0 ?
        <p className="rounded-xl border border-dashed border-cream-300 bg-cream-50 p-8 text-center text-ink-600">
          No products match your filters. Try a different search or category.
        </p>
      : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <CanonicalProductCard key={p.canonical_id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
