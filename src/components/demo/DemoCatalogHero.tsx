"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import type { DemoCatalogResult } from "@/lib/demo-commerce/types";

interface DemoCatalogHeroProps {
  catalog: DemoCatalogResult;
  onSearch?: (q: string) => void;
}

export function DemoCatalogHero({ catalog, onSearch }: DemoCatalogHeroProps) {
  return (
    <div className="border-b border-orange-100/80 bg-gradient-to-br from-cream-50 via-white to-sage-50/40 px-4 py-10 sm:px-6 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-sage-700">
          Verified product catalog
        </p>
        <h1 className="font-homy mt-2 text-3xl font-bold text-ink-900 sm:text-4xl">
          Shop across {catalog.retailers.length} stores
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-600">
          {catalog.total.toLocaleString()} quality-checked listings with retailer images, accurate
          categories, and working checkout links.
        </p>
        <div
          className="mt-6 flex max-w-xl flex-col gap-2 sm:flex-row"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
              size={20}
            />
            <input
              type="search"
              placeholder="Search products, brands, retailers…"
              className="w-full rounded-2xl border border-cream-300 bg-white py-3.5 pl-11 pr-4 text-base shadow-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSearch?.((e.target as HTMLInputElement).value);
                }
              }}
            />
          </div>
          <button
            type="button"
            className="rounded-2xl bg-sage-700 px-8 py-3.5 font-semibold text-white shadow-md hover:bg-sage-800"
            onClick={(e) => {
              const input = (e.currentTarget.parentElement?.querySelector(
                "input[type=search]",
              ) ?? null) as HTMLInputElement | null;
              onSearch?.(input?.value ?? "");
            }}
          >
            Search
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/inventory/status" className="font-medium text-sage-700 hover:underline">
            Ingestion dashboard
          </Link>
          <span className="text-ink-300">·</span>
          <span className="text-ink-500">
            Updated {catalog.updatedAt ? new Date(catalog.updatedAt).toLocaleString() : "recently"}
          </span>
        </div>
      </div>
    </div>
  );
}
