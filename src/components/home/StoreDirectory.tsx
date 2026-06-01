"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, Store } from "lucide-react";
import {
  STORE_DEPARTMENTS,
  groupRetailersByDepartment,
  searchRetailers,
} from "@/lib/retailers/directory";
import {
  PUBLIC_RETAILERS,
  PUBLIC_SHOPPABLE_STORE_COUNT,
} from "@/lib/retailers/public-retailers";

export function StoreDirectory() {
  const [query, setQuery] = useState("");
  const [openDepts, setOpenDepts] = useState<Set<string>>(
    () => new Set(["grocery", "fashion", "luxury", "bags"]),
  );

  const filtered = useMemo(
    () => searchRetailers(query, PUBLIC_RETAILERS),
    [query],
  );

  const grouped = useMemo(
    () => groupRetailersByDepartment(filtered),
    [filtered],
  );

  const totalCount = filtered.length;

  function toggleDept(id: string) {
    setOpenDepts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="bg-white/40 px-4 py-12 sm:px-6 lg:px-12">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-ink-400">
          Stores we compare
        </p>
        <h2 className="font-display mt-2 text-2xl font-bold text-ink-900 md:text-3xl">
          {PUBLIC_SHOPPABLE_STORE_COUNT} retailers with shoppable search
        </h2>
        <p className="mt-2 text-sm text-ink-500">
          Grocery, fashion, home, sports, books, and more — each link opens that
          store with your product pre-filled.
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-2xl">
        <label className="relative block">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stores (e.g. Wegmans, Gucci, Samsonite)…"
            className="w-full rounded-2xl border border-stone-200 bg-white py-3.5 pl-11 pr-4 text-sm text-stone-800 shadow-sm outline-none transition focus:border-sage-400 focus:ring-2 focus:ring-sage-200"
          />
        </label>
        <p className="mt-2 text-center text-xs text-stone-500">
          {query.trim()
            ? `${totalCount} store${totalCount === 1 ? "" : "s"} match “${query.trim()}”`
            : `Browse by category below`}
        </p>
      </div>

      <div className="mx-auto mt-8 max-h-[min(70vh,640px)] max-w-3xl overflow-y-auto rounded-2xl border border-stone-200/80 bg-white shadow-sm">
        {STORE_DEPARTMENTS.map((dept) => {
          const stores = grouped[dept.id];
          if (stores.length === 0) return null;
          const isOpen = openDepts.has(dept.id) || query.trim().length > 0;

          return (
            <div key={dept.id} className="border-b border-stone-100 last:border-b-0">
              <button
                type="button"
                onClick={() => toggleDept(dept.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-stone-50"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sage-50 text-sage-700">
                    <Store size={16} />
                  </span>
                  <div>
                    <p className="font-semibold text-stone-800">{dept.label}</p>
                    <p className="text-xs text-stone-500">{dept.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
                    {stores.length}
                  </span>
                  <ChevronDown
                    size={18}
                    className={`text-stone-400 transition ${isOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              {isOpen && (
                <ul className="grid gap-1 px-3 pb-3 sm:grid-cols-2">
                  {stores.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: r.color }}
                      />
                      <span className="truncate font-medium">{r.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        {totalCount === 0 && (
          <p className="px-6 py-12 text-center text-sm text-stone-500">
            No stores match that search. Try Kroger, Nike, or Whole Foods.
          </p>
        )}
      </div>

      <p className="mx-auto mt-4 max-w-xl text-center text-xs text-stone-400">
        Not listed: meal-kit subscriptions (HelloFresh, Blue Apron), Trader Joe&apos;s
        (no national online shop), and audiobook-only services — we only include stores
        where product search links work reliably.
      </p>
    </section>
  );
}
