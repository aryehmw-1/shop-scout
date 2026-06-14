"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ExternalLink, Search } from "lucide-react";
import type { VerifiedBrowseResult } from "@/lib/inventory/verified-inventory-browse";
import { affiliateSafeDestination } from "@/lib/affiliate/outbound";
import type { RetailerId } from "@/lib/types";
import { formatPrice } from "@/lib/utils/format";
import { ProductImage } from "@/components/ProductImage";
import { trackEvent } from "@/lib/analytics/track-client";

interface VerifiedInventoryClientProps {
  initial: VerifiedBrowseResult;
}

const PAGE_SIZE = 48;

export function VerifiedInventoryClient({ initial }: VerifiedInventoryClientProps) {
  const [query, setQuery] = useState("");
  // Paginated: we start with the server's first page and load more on demand —
  // never the full ~13k catalog at once.
  const [products, setProducts] = useState(initial.products);
  const [total, setTotal] = useState(initial.totalProducts);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Fire once per mount — inventory page view.
  useEffect(() => {
    trackEvent({ name: "inventory_page_viewed", properties: { productCount: initial.totalProducts } });
  }, [initial.totalProducts]);

  // Debounced server-side search (uses the trgm index). Empty query → first page.
  useEffect(() => {
    const q = query.trim();
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/inventory/browse?offset=0&limit=${PAGE_SIZE}&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setProducts(data.products ?? []);
        setTotal(data.totalProducts ?? 0);
      } catch {
        /* keep current results on error */
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/inventory/browse?offset=${products.length}&limit=${PAGE_SIZE}&q=${encodeURIComponent(query.trim())}`,
      );
      const data = await res.json();
      setProducts((prev) => [...prev, ...(data.products ?? [])]);
      setTotal(data.totalProducts ?? total);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-sage-300 bg-sage-50/60 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-sage-700" size={24} />
          <div>
            <h2 className="text-lg font-bold text-sage-950">Verified products</h2>
            <p className="mt-1 text-sm leading-relaxed text-sage-900/85">
              Every product here has a price we verified from the retailer. Search
              to find one, then compare or shop it.
            </p>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          aria-label="Search products"
          className="w-full rounded-2xl border border-stone-200 bg-white py-3 pl-11 pr-4 text-base text-stone-800 shadow-sm placeholder:text-stone-400 focus:border-sage-300 focus:outline-none focus:ring-2 focus:ring-sage-200/60"
        />
      </div>

      <p className="text-sm text-stone-600">
        Showing <strong>{products.length}</strong> of {total.toLocaleString()} product
        {total === 1 ? "" : "s"}
        {loading && <span className="ml-2 text-stone-400">searching…</span>}
      </p>

      {products.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
          <p className="font-medium text-stone-800">
            {query ? `No products match "${query}"` : "No products yet"}
          </p>
          <Link
            href="/chat"
            className="mt-4 inline-flex rounded-xl bg-sage-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sage-800"
          >
            Search for a product
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <article
            key={p.catalogId}
            className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
          >
            <div className="relative aspect-square bg-stone-50">
              <ProductImage
                src={p.imageUrl}
                alt={p.title}
                className="h-full w-full object-contain p-2"
              />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <h3 className="font-semibold leading-snug text-stone-900">
                {p.brand} {p.title}
              </h3>
              {p.size && <p className="text-xs text-stone-500">{p.size}</p>}
              <p className="mt-2 text-lg font-bold text-sage-800">
                {p.minPrice === p.maxPrice
                  ? formatPrice(p.minPrice)
                  : `${formatPrice(p.minPrice)} – ${formatPrice(p.maxPrice)}`}
              </p>
              <p className="mt-1 text-xs text-stone-500">{p.retailers.join(", ")}</p>
              <div className="mt-auto flex gap-2 pt-4">
                <Link
                  href={`/chat?q=${encodeURIComponent(`${p.brand} ${p.title}`)}`}
                  className="flex-1 rounded-xl bg-sage-700 py-2 text-center text-sm font-semibold text-white hover:bg-sage-800"
                >
                  Compare
                </Link>
                {(() => {
                  const dest = affiliateSafeDestination(
                    p.bestQuote.retailerId as RetailerId,
                    p.bestQuote.productUrl,
                  );
                  if (!dest) return null;
                  return (
                    <a
                      href={dest}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="inline-flex items-center justify-center rounded-xl border border-stone-200 px-3 py-2 text-stone-600 hover:bg-stone-50"
                      aria-label="View on retailer"
                    >
                      <ExternalLink size={16} />
                    </a>
                  );
                })()}
              </div>
            </div>
          </article>
        ))}
      </div>

      {products.length < total && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-xl border border-sage-300 bg-white px-6 py-2.5 text-sm font-semibold text-sage-800 shadow-sm hover:bg-sage-50 disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : `Load more (${(total - products.length).toLocaleString()} left)`}
          </button>
        </div>
      )}
    </div>
  );
}
