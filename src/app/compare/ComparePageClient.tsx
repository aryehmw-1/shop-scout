"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ProductOffer, ProductSearchResults } from "@/lib/types";
import { CompareExperience } from "@/components/CompareExperience";
import { loadAddress } from "@/lib/storage";
import { trackEvent, trackPageView } from "@/lib/analytics/track-client";
import { Loader2, Search, ArrowLeft } from "lucide-react";

const EXAMPLE_QUERIES = [
  "organic whole milk",
  "mens running shoes",
  "paper towels",
  "boneless chicken breast",
];

export function ComparePageClient() {
  const params = useSearchParams();
  const initialQ = params.get("q") ?? params.get("catalog") ?? "";
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<ProductSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    trackPageView("compare");
  }, []);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    const started = Date.now();

    trackEvent({
      name: "search_performed",
      properties: { query: trimmed, source: "compare_page" },
    });

    try {
      const zip = loadAddress()?.zipCode ?? "78701";
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: trimmed, zipCode: zip, organic: trimmed.includes("organic") }),
      });

      if (!res.ok) throw new Error("Search failed");

      const data = await res.json();
      setResults(data.productResults);

      trackEvent({
        name: "search_first_results",
        properties: {
          query: trimmed,
          offerCount: data.productResults?.online?.length ?? 0,
          timeToFirstResultMs: Date.now() - started,
          source: "compare_page",
        },
      });

      const catalogId = data.productResults?.enrichmentCatalogId;
      if (data.productResults?.enrichmentPending && catalogId) {
        const enrichStart = Date.now();
        trackEvent({
          name: "enrichment_started",
          properties: { catalogId, query: trimmed },
        });

        fetch("/api/search/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: { query: trimmed, zipCode: zip },
            catalogId,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((enriched) => {
            if (enriched?.productResults) {
              setResults(enriched.productResults);
              trackEvent({
                name: "enrichment_completed",
                properties: {
                  catalogId,
                  latencyMs: Date.now() - enrichStart,
                  offerCountAfter: enriched.productResults.online?.length ?? 0,
                  success: true,
                },
              });
            }
          })
          .catch(() => {
            trackEvent({
              name: "enrichment_completed",
              properties: {
                catalogId,
                latencyMs: Date.now() - enrichStart,
                success: false,
              },
            });
          });
      }
    } catch {
      setError("We couldn't load prices right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQ) runSearch(initialQ);
  }, [initialQ, runSearch]);

  const handleSave = useCallback((offer: ProductOffer) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(offer.id)) next.delete(offer.id);
      else next.add(offer.id);
      return next;
    });
    trackEvent({
      name: "watchlist_add",
      properties: { offerId: offer.id, retailer: offer.retailer },
    });
  }, []);

  const handleShopClick = useCallback((_offer: ProductOffer) => {
    /* Outbound redirect logs clicks server-side */
  }, []);

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6 sm:max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/chat"
          className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
          aria-label="Back to chat"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="font-homy text-xl font-bold text-stone-900">Compare prices</h1>
          <p className="text-sm text-stone-500">Verified live prices across top stores</p>
        </div>
      </div>

      <form
        className="mb-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
      >
        <label htmlFor="compare-search" className="sr-only">
          Product to compare
        </label>
        <input
          id="compare-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. organic milk, running shoes…"
          className="flex-1 rounded-xl border border-stone-200 px-4 py-3 text-sm focus:border-sage-500 focus:outline-none focus:ring-2 focus:ring-sage-200"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="flex items-center gap-2 rounded-xl bg-sage-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sage-700 disabled:opacity-50"
        >
          {loading ?
            <Loader2 size={18} className="animate-spin" />
          : <Search size={18} />}
          <span className="hidden sm:inline">Compare</span>
        </button>
      </form>

      {!results && !loading && !error && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <p className="mb-3 text-sm font-medium text-stone-700">Try an example</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setQuery(ex);
                  runSearch(ex);
                }}
                className="rounded-full border border-stone-200 px-3 py-1.5 text-sm text-stone-700 hover:border-sage-400 hover:bg-sage-50"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && !results && (
        <div className="flex flex-col items-center gap-3 py-16 text-stone-500" role="status">
          <Loader2 size={32} className="animate-spin text-sage-600" />
          <p>Checking stores for live prices…</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {error}
          <button
            type="button"
            onClick={() => runSearch(query)}
            className="ml-2 font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {results && (
        <CompareExperience
          results={results}
          savedIds={savedIds}
          onSave={handleSave}
          onShopClick={handleShopClick}
          searchQuery={query}
        />
      )}
    </div>
  );
}
