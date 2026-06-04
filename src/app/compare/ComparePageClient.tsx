"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { ProductOffer, ProductSearchResults } from "@/lib/types";
import { CompareExperience } from "@/components/CompareExperience";
import { loadAddress } from "@/lib/storage";
import { trackEvent, trackPageView } from "@/lib/analytics/track-client";
import { ArrowLeft, Loader2, PackageSearch, Search } from "lucide-react";

const EXAMPLE_QUERIES = [
  "whole milk gallon",
  "Cheerios cereal",
  "Greek yogurt",
  "paper towels",
];

const LOADING_STEPS = [
  "Searching live offers...",
  "Matching the product...",
  "Comparing delivered prices...",
  "Ranking the best options...",
];

async function fetchInventorySearch(
  query: string,
  zip: string,
  signal: AbortSignal,
): Promise<ProductSearchResults | null> {
  const res = await fetch(
    `/api/inventory/search?q=${encodeURIComponent(query)}&zip=${encodeURIComponent(zip)}`,
    { credentials: "include", signal },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    matched?: boolean;
    productResults?: ProductSearchResults;
  };
  if (data.matched && data.productResults?.online?.length) {
    return data.productResults;
  }
  return null;
}

async function fetchCanonicalProduct(
  id: string,
  signal: AbortSignal,
): Promise<ProductSearchResults | null> {
  const res = await fetch(`/api/inventory/canonical/${encodeURIComponent(id)}`, {
    credentials: "include",
    signal,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { productResults?: ProductSearchResults };
  return data.productResults?.online?.length ? data.productResults : null;
}

interface ComparePageClientProps {
  initialQuery?: string;
  initialProductId?: string;
  initialResults?: ProductSearchResults | null;
  initialError?: string | null;
}

export function ComparePageClient({
  initialQuery = "",
  initialProductId = "",
  initialResults = null,
  initialError = null,
}: ComparePageClientProps) {
  const params = useSearchParams();
  const productId = params.get("product") ?? params.get("catalog") ?? "";
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery || urlQuery);
  const [results, setResults] = useState<ProductSearchResults | null>(initialResults);
  const [loading, setLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(initialError);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const searchGenerationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** Skip URL effect after client search already triggered load + router.replace. */
  const skipNextUrlLoadRef = useRef(false);
  const initialRouteHandledRef = useRef(Boolean(initialResults || initialError));

  useEffect(() => {
    trackPageView("compare");
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoadingStepIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setLoadingStepIndex((current) =>
        Math.min(current + 1, LOADING_STEPS.length - 1),
      );
    }, 850);
    return () => window.clearInterval(timer);
  }, [loading]);

  const beginLoad = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const generation = ++searchGenerationRef.current;
    setLoading(true);
    setError(null);
    setResults(null);
    return { generation, signal: abortRef.current.signal };
  }, []);

  const finishLoad = useCallback((generation: number) => {
    if (generation === searchGenerationRef.current) {
      setLoading(false);
    }
  }, []);

  const applyResults = useCallback(
    (generation: number, productResults: ProductSearchResults | null, err?: string) => {
      if (generation !== searchGenerationRef.current) return;
      if (productResults?.online?.length) {
        setResults(productResults);
        setError(null);
        if (productResults.matchedProduct?.title) {
          setQuery(productResults.matchedProduct.title);
        }
      } else {
        setResults(null);
        setError(err ?? "No matching product in inventory. Try another name or browse inventory.");
      }
    },
    [],
  );

  const runSearch = useCallback(
    async (q: string, options?: { syncUrl?: boolean }) => {
      const trimmed = q.trim();
      if (!trimmed) return;

      const { generation, signal } = beginLoad();
      const started = Date.now();
      const zip = loadAddress()?.zipCode ?? "78701";
      setQuery(trimmed);

      trackEvent({
        name: "search_performed",
        properties: { query: trimmed, source: "compare_page" },
      });

      if (options?.syncUrl) {
        window.history.replaceState(null, "", `/compare?q=${encodeURIComponent(trimmed)}`);
      }

      try {
        const productResults = await fetchInventorySearch(trimmed, zip, signal);
        if (generation !== searchGenerationRef.current) return;

        applyResults(generation, productResults);

        if (productResults) {
          trackEvent({
            name: "search_first_results",
            properties: {
              query: trimmed,
              offerCount: productResults.online.length,
              timeToFirstResultMs: Date.now() - started,
              source: "compare_page_inventory",
            },
          });
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (generation !== searchGenerationRef.current) return;
        setError("We couldn't load prices right now. Please try again.");
        setResults(null);
      } finally {
        finishLoad(generation);
      }
    },
    [applyResults, beginLoad, finishLoad],
  );

  const loadProductById = useCallback(
    async (id: string) => {
      const trimmed = id.trim();
      if (!trimmed) return;

      const { generation, signal } = beginLoad();

      try {
        const productResults = await fetchCanonicalProduct(trimmed, signal);
        if (generation !== searchGenerationRef.current) return;
        applyResults(
          generation,
          productResults,
          "Product comparison not found. Browse inventory for available products.",
        );
        if (productResults?.matchedProduct?.title) {
          setQuery(productResults.matchedProduct.title);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (generation !== searchGenerationRef.current) return;
        setError("Product comparison not found.");
        setResults(null);
      } finally {
        finishLoad(generation);
      }
    },
    [applyResults, beginLoad, finishLoad],
  );

  /** URL-driven load: product id wins over text query (prevents double-fetch). */
  useEffect(() => {
    if (skipNextUrlLoadRef.current) {
      skipNextUrlLoadRef.current = false;
      return;
    }

    const id = productId.trim();
    const q = urlQuery.trim();
    if (!id && !q) return;

    if (
      initialRouteHandledRef.current &&
      id === initialProductId &&
      q === initialQuery
    ) {
      initialRouteHandledRef.current = false;
      return;
    }

    if (id) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) void loadProductById(id);
      });
      return () => {
        cancelled = true;
        abortRef.current?.abort();
        searchGenerationRef.current += 1;
      };
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void runSearch(q);
    });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      searchGenerationRef.current += 1;
    };
  }, [initialProductId, initialQuery, productId, urlQuery, loadProductById, runSearch]);

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

  const handleShopClick = useCallback(() => {
    /* Outbound redirect logs clicks server-side */
  }, []);

  const showEmpty = !results && !loading && !error;
  const pageMaxWidth = results && !loading ? "max-w-5xl" : "max-w-3xl";
  const pageTitle = results && !loading ? "Compare prices" : "What do you want to compare?";
  const pageDescription =
    results && !loading
      ? "Lowest price first, with the other stores underneath."
      : "Search one product. We will compare stores and put the cheapest option first.";

  return (
    <div className={`mx-auto min-h-0 w-full ${pageMaxWidth} flex-1 px-4 py-6 sm:px-6 lg:px-8`}>
      <div className={`mb-6 flex items-center gap-3 ${showEmpty ? "pt-10 sm:pt-16" : ""}`}>
        <Link
          href="/"
          scroll={false}
          className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
          aria-label="Back to home"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="font-homy text-xl font-bold text-stone-900 sm:text-2xl">
            {pageTitle}
          </h1>
          <p className="text-sm text-stone-500">
            {pageDescription}
          </p>
        </div>
      </div>

      <form
        action="/compare"
        method="get"
        className="mb-6 flex gap-2 rounded-2xl border border-stone-200 bg-white p-2 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(query, { syncUrl: true });
        }}
      >
        <label htmlFor="compare-search" className="sr-only">
          Product to compare
        </label>
        <input
          id="compare-search"
          name="q"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search milk, cereal, paper towels..."
          className="min-w-0 flex-1 rounded-xl border border-transparent px-4 py-3 text-sm focus:border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-200"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          aria-label="Compare prices"
          className="flex shrink-0 items-center gap-2 rounded-xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {loading ?
            <Loader2 size={18} className="animate-spin" />
          : <Search size={18} />}
          <span className="hidden sm:inline">Compare</span>
        </button>
      </form>

      {showEmpty && (
        <div className="text-center">
          <p className="mb-3 text-sm font-bold text-stone-500">
            Popular searches
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_QUERIES.map((ex) => (
              <Link
                key={ex}
                href={`/compare?q=${encodeURIComponent(ex)}`}
                scroll={false}
                className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-semibold text-stone-600 hover:border-stone-300 hover:text-stone-950"
              >
                {ex}
              </Link>
            ))}
          </div>
          <p className="mt-4 text-sm text-stone-500">
            Or{" "}
            <Link href="/inventory" scroll={false} className="font-semibold text-stone-800 underline">
              browse inventory
            </Link>
            .
          </p>
        </div>
      )}

      {loading && (
        <div role="status" aria-busy="true" aria-label="Loading prices">
          <div className="mb-4 rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm font-semibold text-stone-600 shadow-sm">
            {LOADING_STEPS[loadingStepIndex]}
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-stone-200 bg-white p-4"
              >
                <div className="aspect-square rounded-xl bg-stone-200" />
                <div className="mt-3 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-stone-200" />
                  <div className="h-6 w-1/2 rounded bg-stone-100" />
                  <div className="h-9 w-full rounded-lg bg-stone-200" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && !loading && (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-950 shadow-sm"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <PackageSearch size={22} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
            <div className="min-w-0">
              <p className="font-bold text-amber-950">No verified comparison match yet</p>
              <p className="mt-1 leading-relaxed">
                {error} Try a simpler product name, or browse inventory for items we can already compare.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runSearch(query, { syncUrl: true })}
                  className="inline-flex items-center gap-2 rounded-xl bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
                >
                  <Search size={15} aria-hidden />
                  Search again
                </button>
                <Link
                  href="/inventory"
                  scroll={false}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-50"
                >
                  Browse inventory
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {results && !loading && (
        <CompareExperience
          results={results}
          savedIds={savedIds}
          onSave={handleSave}
          onShopClick={handleShopClick}
          searchQuery={query}
          layoutMode="grid"
        />
      )}
    </div>
  );
}
