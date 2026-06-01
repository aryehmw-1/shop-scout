"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductOffer, ProductSearchResults } from "@/lib/types";
import { prepareResultsForDisplay } from "@/lib/offers/offer-ranking";
import { isVerifiedOffer } from "@/lib/offers/offer-trust";
import { showEstimatedOffersInUi } from "@/lib/offers/offer-persist-validation";
import { cheapestVerifiedPrice } from "@/lib/search/price-truth";
import { formatPrice } from "@/lib/utils/format";
import { ProductGrid } from "./ProductGrid";
import { CompareTable } from "./CompareTable";
import { ProductImage } from "./ProductImage";
import { PhotoSourceLabel } from "./PhotoSourceLabel";
import { LayoutGrid, List, Truck, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { BestDealHero } from "./BestDealHero";
import { LinkProductHero } from "./LinkProductHero";
import { CompareExperience } from "./CompareExperience";
import { useExperiment } from "@/lib/experiments/useExperiment";
import {
  SearchPipelineDebugPanel,
  searchDebugEnabledClient,
} from "./SearchPipelineDebugPanel";
import { ConversationDebugPanel } from "./ConversationDebugPanel";
import { buildRetrievalTrustDiagnostic } from "@/lib/search/retrieval-trust-message";
import { CategoryConfidenceBanner } from "./search/CategoryConfidenceBanner";
import { SearchEmptyRecovery } from "./search/SearchEmptyRecovery";
import { VerifiedCompareHeader } from "./search/VerifiedCompareHeader";
import { VerifiedInventoryHitBanner } from "./search/VerifiedInventoryHitBanner";
import { MatchQualityBanner } from "./search/MatchQualityBanner";
import { RetrievalNormalizationBanner } from "./search/RetrievalNormalizationBanner";
import { CatalogFreshnessBanner } from "./FreshnessIndicator";
import { inferQueryCategoryFamily } from "@/lib/inventory/category-coverage";
import { CATALOG } from "@/lib/retailers/catalog";

const VIEW_STORAGE_KEY = "shop-scout-results-view";

interface ProductResultsProps {
  results: ProductSearchResults;
  savedIds: Set<string>;
  onSave: (offer: ProductOffer) => void;
  onShopClick?: (offer: ProductOffer) => void;
  enriching?: boolean;
  searchQuery?: string;
  conversationDebug?: import("@/lib/types").ConversationDebugSnapshot;
}

export function ProductResults({
  results,
  savedIds,
  onSave,
  onShopClick,
  enriching,
  searchQuery,
  conversationDebug,
}: ProductResultsProps) {
  const compareLayout = useExperiment("compare_layout");
  const display =
    results.estimatedOnline !== undefined ?
      results
    : prepareResultsForDisplay(results, { searchQuery });
  const { online, estimatedOnline = [], lowConfidenceOnline = [], zipCode, compareMode, referenceProduct, similarMode } =
    display;
  const queryFamily = inferQueryCategoryFamily(searchQuery ?? results.matchedProduct?.title);
  const hasLowConfidence = (lowConfidenceOnline?.length ?? 0) > 0;
  const showLowConfidence =
    hasLowConfidence &&
    (searchDebugEnabledClient() ||
      showEstimatedOffersInUi() ||
      queryFamily === "apparel");

  const defaultView = compareMode ? "table" : "cards";
  const [view, setView] = useState<"cards" | "table">(defaultView);
  const [viewReady, setViewReady] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "cards" || stored === "table") {
        setView(stored);
      }
    } catch {
      /* ignore */
    }
    setViewReady(true);
  }, []);

  const setViewPersisted = useCallback((next: "cards" | "table") => {
    setView(next);
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  if (!online.length && !estimatedOnline.length && !showLowConfidence) {
    const q = searchQuery ?? results.matchedProduct?.title ?? "";
    const trust = buildRetrievalTrustDiagnostic(results, q);
    return (
      <div className="mt-4 space-y-4">
        {q && <CategoryConfidenceBanner query={q} compact={false} />}
        <SearchEmptyRecovery query={q} trust={trust} />
        {results.searchDebug && searchDebugEnabledClient() && (
          <SearchPipelineDebugPanel debug={results.searchDebug} />
        )}
        {conversationDebug && searchDebugEnabledClient() && (
          <ConversationDebugPanel debug={conversationDebug} />
        )}
      </div>
    );
  }

  const ViewToggle = ({ className = "" }: { className?: string }) => (
    <div
      className={`flex rounded-lg border border-stone-200 bg-white p-0.5 ${className}`}
      role="group"
      aria-label="Results layout"
    >
      <button
        type="button"
        onClick={() => setViewPersisted("cards")}
        aria-pressed={view === "cards"}
        className={`rounded-md p-1.5 transition ${
          view === "cards"
            ? "bg-sage-100 text-sage-800"
            : "text-stone-400 hover:text-stone-600"
        }`}
        aria-label="Grid view"
      >
        <LayoutGrid size={16} />
      </button>
      <button
        type="button"
        onClick={() => setViewPersisted("table")}
        aria-pressed={view === "table"}
        className={`rounded-md p-1.5 transition ${
          view === "table"
            ? "bg-sage-100 text-sage-800"
            : "text-stone-400 hover:text-stone-600"
        }`}
        aria-label="List view"
      >
        <List size={16} />
      </button>
    </div>
  );

  const matched = display.matchedProduct;
  const verifiedFrom = cheapestVerifiedPrice(display);
  const bestOffer = online.find((o) => o.isBestDeal) ?? online[0];
  const resultCategoryId =
    results.searchDebug?.resolvedCatalogId ??
    online[0]?.catalogId ??
    estimatedOnline[0]?.catalogId;
  const categoryId = resultCategoryId
    ? CATALOG.find((c) => c.id === resultCategoryId)?.category
    : undefined;
  const compareQuery =
    searchQuery?.trim() ||
    matched?.title ||
    (online[0] ? `${online[0].brand} ${online[0].title}`.trim() : "");
  const compareHref =
    compareQuery ?
      `/compare?q=${encodeURIComponent(compareQuery)}${
        online[0]?.catalogId ? `&catalog=${encodeURIComponent(online[0].catalogId)}` : ""
      }`
    : null;

  const renderOffers = (offers: ProductOffer[], layout: "grid" | "carousel" = "grid") => {
    if (!offers.length) return null;

    if (view === "table") {
      return (
        <CompareTable
          products={offers}
          savedIds={savedIds}
          onSave={onSave}
          onShopClick={onShopClick}
          catalogId={offers[0]?.catalogId}
          searchQuery={searchQuery}
        />
      );
    }

    if (compareMode && compareLayout === "cards") {
      return (
        <CompareExperience
          results={{ ...display, online: offers }}
          savedIds={savedIds}
          onSave={onSave}
          onShopClick={onShopClick}
          searchQuery={searchQuery}
        />
      );
    }

    return (
      <ProductGrid
        products={offers}
        savedIds={savedIds}
        onSave={onSave}
        onShopClick={onShopClick}
        layout={layout}
      />
    );
  };

  const showViewToggle = viewReady && (online.length > 0 || estimatedOnline.length > 0);

  return (
    <div className="mt-4 w-full max-w-full space-y-4">
      {display.verifiedInventoryHit?.matched && (
        <VerifiedInventoryHitBanner hit={display.verifiedInventoryHit} />
      )}

      <RetrievalNormalizationBanner
        query={searchQuery ?? matched?.title}
        retrievalMeta={display.retrievalMeta}
        closestMatchFallback={display.closestMatchFallback}
        noExactMatchFound={display.noExactMatchFound}
      />

      <MatchQualityBanner
        noExactMatchFound={display.noExactMatchFound && !display.closestMatchFallback}
        query={searchQuery ?? matched?.title}
      />

      {display.catalogFreshnessWarning && (
        <CatalogFreshnessBanner
          message={display.catalogFreshnessWarning.message}
          staleCount={display.catalogFreshnessWarning.staleCount}
          totalCount={display.catalogFreshnessWarning.totalCount}
        />
      )}

      {!display.verifiedInventoryHit?.matched &&
        display.searchDebug?.verifiedInventoryResolution &&
        searchDebugEnabledClient() && (
          <details className="rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-amber-900">
              Verified inventory lookup — no hit
            </summary>
            <p className="mt-2 text-xs text-amber-800">
              {display.searchDebug.verifiedInventoryResolution.candidateCount ?? 0} candidates
              considered. Persisted DB was searched before generic retrieval.
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-900">
              {display.searchDebug.verifiedInventoryResolution.candidates?.map((c) => (
                <li key={c.catalogId}>
                  {c.title} ({c.catalogId}) — score {c.score}
                  {c.hasPersistedQuotes ? " · has quotes" : " · no quotes"}
                  {c.rejectedReason ? ` · ${c.rejectedReason}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}

      {searchQuery && (
        <CategoryConfidenceBanner query={searchQuery} compact={online.length > 0} />
      )}
      {compareHref && online.length > 0 && (
        <div className="flex justify-end">
          <Link
            href={compareHref}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm font-semibold text-sage-800 shadow-sm hover:border-sage-400 hover:bg-sage-50"
          >
            Open full compare view
            <ExternalLink size={14} aria-hidden />
          </Link>
        </div>
      )}

      {matched && !similarMode && (
        <div className="flex gap-4 rounded-2xl border border-orange-200/80 bg-cream-50/90 p-4 sm:p-5">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm sm:h-28 sm:w-28">
            <ProductImage
              src={matched.imageUrl}
              alt={matched.title}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              Showing prices for
            </p>
            <h3 className="font-homy mt-0.5 text-lg font-bold leading-snug text-ink-900 sm:text-xl">
              {matched.title}
            </h3>
            <PhotoSourceLabel source={matched.imageSource} className="mt-1" />
            <p className="text-sm text-ink-500">{matched.brand}</p>
            {(verifiedFrom ?? matched.fromPrice) != null && (
              <p className="mt-1 text-sm font-semibold text-sage-700">
                {verifiedFrom != null
                  ? `From ${formatPrice(verifiedFrom)} (verified live)`
                  : `About ${formatPrice(matched.fromPrice!)} — check stores below`}
              </p>
            )}
          </div>
        </div>
      )}

      {referenceProduct && (similarMode || results.linkMatch) && (
        <LinkProductHero reference={referenceProduct} />
      )}

      {similarMode && referenceProduct && !results.linkMatch && (
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          <p>
            <span className="font-medium text-stone-800">From your link:</span>{" "}
            {referenceProduct.title}
            <span className="text-stone-400">
              {" "}
              · about ${referenceProduct.referencePrice.toFixed(2)}
            </span>
          </p>
        </div>
      )}

      {showViewToggle && !compareMode && (
        <div className="flex items-center justify-end">
          <ViewToggle />
        </div>
      )}

      {(enriching || results.enrichmentPending) && (
        <div className="flex items-center gap-2 rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800">
          <Loader2 size={16} className="animate-spin shrink-0" />
          Checking more stores for better prices…
        </div>
      )}

      {bestOffer && online.length > 0 && (
        <BestDealHero offer={bestOffer} onShopClick={onShopClick} />
      )}

      {online.length > 0 && (
        <section className="flex min-w-0 flex-col rounded-2xl border-2 border-sage-400/70 bg-sage-50/30 p-4 sm:p-5">
          <VerifiedCompareHeader
            categoryId={categoryId}
            offerCount={online.length}
            zipCode={zipCode}
          />
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <Truck size={22} className="text-sage-700" />
              </div>
              <div className="min-w-0">
                <h4 className="text-base font-bold text-stone-900 sm:text-lg">
                  {display.closestMatchFallback ?
                    `Closest matches (${online.length})`
                  : results.linkMatch?.useExactCompare ?
                    "Matching offers"
                  : "Best prices"} ({online.length})
                </h4>
                <p className="mt-0.5 text-xs text-stone-600 sm:text-sm">
                  {display.closestMatchFallback ?
                    "Estimated catalog prices · confirm pack size on retailer"
                  : "Verified live retailer pricing"}
                  {zipCode ? ` · ships to ${zipCode}` : " · add ZIP for regional shipping/tax"}
                </p>
              </div>
            </div>
            {showViewToggle && <ViewToggle />}
          </div>
          {renderOffers(online)}
        </section>
      )}

      {(display.matchTiers?.similar?.length ?? 0) > 0 && (
        <section className="flex min-w-0 flex-col rounded-2xl border border-violet-200 bg-violet-50/40 p-4 sm:p-5">
          <div className="mb-4 min-w-0">
            <h4 className="text-base font-bold text-violet-950 sm:text-lg">
              Similar products ({display.matchTiers!.similar.length})
            </h4>
            <p className="mt-0.5 text-xs text-violet-900/80 sm:text-sm">
              Related items in the same category — not exact matches, but worth comparing
            </p>
          </div>
          {renderOffers(display.matchTiers!.similar, "carousel")}
        </section>
      )}

      {(display.matchTiers?.brandAlternatives?.length ?? 0) > 0 && (
        <section className="flex min-w-0 flex-col rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
          <div className="mb-4 min-w-0">
            <h4 className="text-base font-bold text-stone-900 sm:text-lg">
              Brand alternatives ({display.matchTiers!.brandAlternatives.length})
            </h4>
            <p className="mt-0.5 text-xs text-stone-600 sm:text-sm">
              Same category, different brand — useful when your preferred brand is out of stock
            </p>
          </div>
          {renderOffers(display.matchTiers!.brandAlternatives, "carousel")}
        </section>
      )}

      {display.groceryRetrievalDebug && searchDebugEnabledClient() && (
        <details className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-sky-900">
            Grocery retrieval debug
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[10px] text-sky-950">
            {JSON.stringify(display.groceryRetrievalDebug, null, 2)}
          </pre>
        </details>
      )}

      {showEstimatedOffersInUi() && estimatedOnline.length > 0 && (
        <section className="flex min-w-0 flex-col rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50/80 p-4 sm:p-5">
          <div className="mb-4 flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
              <AlertTriangle size={22} className="text-amber-700" />
            </div>
            <div className="min-w-0">
              <h4 className="text-base font-bold text-stone-800 sm:text-lg">
                Estimated prices ({estimatedOnline.length})
              </h4>
              <p className="mt-0.5 text-xs text-stone-600 sm:text-sm">
                Not verified yet · confirm on the retailer before buying
              </p>
            </div>
          </div>
          {renderOffers(estimatedOnline)}
        </section>
      )}

      {showLowConfidence && (
        <section className="flex min-w-0 flex-col rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-4 sm:p-5">
          <div className="mb-4 flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
              <AlertTriangle size={22} className="text-amber-700" />
            </div>
            <div className="min-w-0">
              <h4 className="text-base font-bold text-amber-900 sm:text-lg">
                {queryFamily === "apparel"
                  ? "Related matches (unverified)"
                  : "Other matches"} ({lowConfidenceOnline.length})
              </h4>
              <p className="mt-0.5 text-xs text-amber-800 sm:text-sm">
                {queryFamily === "apparel"
                  ? "These offers did not pass verification — paste a product link for more reliable apparel pricing"
                  : "These did not meet our verification bar — double-check pack size and product details"}
              </p>
            </div>
          </div>
          {renderOffers(lowConfidenceOnline)}
          {queryFamily === "apparel" && online.length === 0 && (
            <Link
              href="/chat?hint=link"
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-50"
            >
              Paste Amazon product URL
              <ExternalLink size={14} />
            </Link>
          )}
        </section>
      )}

      {results.searchDebug && searchDebugEnabledClient() && (
        <SearchPipelineDebugPanel debug={results.searchDebug} />
      )}

      {conversationDebug && searchDebugEnabledClient() && (
        <ConversationDebugPanel debug={conversationDebug} />
      )}

      {online.length === 0 && (showLowConfidence || estimatedOnline.length > 0) && searchQuery && (
        <SearchEmptyRecovery
          query={searchQuery}
          trust={buildRetrievalTrustDiagnostic(results, searchQuery)}
        />
      )}

      {online.length === 0 && showEstimatedOffersInUi() && estimatedOnline.length > 0 && (
        <p className="text-center text-sm text-amber-800">
          No verified live prices yet — check estimated offers below or try a more specific search.
        </p>
      )}
    </div>
  );
}
