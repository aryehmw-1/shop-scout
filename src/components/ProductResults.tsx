"use client";

import { useState } from "react";
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
import { ValueProposition } from "./ValueProposition";
import { LinkProductHero } from "./LinkProductHero";
import { CompareExperience } from "./CompareExperience";
import { useExperiment } from "@/lib/experiments/useExperiment";
import {
  SearchPipelineDebugPanel,
  searchDebugEnabledClient,
} from "./SearchPipelineDebugPanel";

interface ProductResultsProps {
  results: ProductSearchResults;
  savedIds: Set<string>;
  onSave: (offer: ProductOffer) => void;
  onShopClick?: (offer: ProductOffer) => void;
  enriching?: boolean;
  searchQuery?: string;
}

export function ProductResults({
  results,
  savedIds,
  onSave,
  onShopClick,
  enriching,
  searchQuery,
}: ProductResultsProps) {
  const compareLayout = useExperiment("compare_layout");
  const display =
    results.estimatedOnline !== undefined ?
      results
    : prepareResultsForDisplay(results);
  const { online, estimatedOnline = [], lowConfidenceOnline = [], zipCode, compareMode, referenceProduct, similarMode } =
    display;
  const showLowConfidence =
    (searchDebugEnabledClient() || showEstimatedOffersInUi()) &&
    lowConfidenceOnline.length > 0;
  const [view, setView] = useState<"cards" | "table">(
    compareMode ? "table" : "cards",
  );

  if (!online.length && !estimatedOnline.length && !showLowConfidence) {
    const q = searchQuery ?? results.matchedProduct?.title ?? "";
    return (
      <div className="mt-4 space-y-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
        <p className="font-medium text-stone-800">No verified offers yet</p>
        <p className="text-sm text-stone-600">
          Stores may be temporarily unavailable. We only show prices we can verify live.
        </p>
        {results.searchDebug && searchDebugEnabledClient() && (
          <SearchPipelineDebugPanel debug={results.searchDebug} />
        )}
        {q && (
          <Link
            href={`/compare?q=${encodeURIComponent(q)}`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-sage-700 hover:underline"
          >
            Open compare view
            <ExternalLink size={14} />
          </Link>
        )}
        <ValueProposition compact />
      </div>
    );
  }

  const verifiedCount = online.filter(isVerifiedOffer).length;

  const ViewToggle = () => (
    <div className="flex rounded-lg border border-stone-200 bg-white p-0.5">
      <button
        type="button"
        onClick={() => setView("cards")}
        className={`rounded-md p-1.5 transition ${
          view === "cards"
            ? "bg-sage-100 text-sage-800"
            : "text-stone-400 hover:text-stone-600"
        }`}
        aria-label="Card view"
      >
        <LayoutGrid size={16} />
      </button>
      <button
        type="button"
        onClick={() => setView("table")}
        className={`rounded-md p-1.5 transition ${
          view === "table"
            ? "bg-sage-100 text-sage-800"
            : "text-stone-400 hover:text-stone-600"
        }`}
        aria-label="Table view"
      >
        <List size={16} />
      </button>
    </div>
  );

  const matched = display.matchedProduct;
  const verifiedFrom = cheapestVerifiedPrice(display);
  const bestOffer = online.find((o) => o.isBestDeal) ?? online[0];
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

  const renderOffers = (offers: ProductOffer[], layout: "grid" | "carousel" = "grid") =>
    compareMode && compareLayout === "cards" ?
      <CompareExperience
        results={{ ...display, online: offers }}
        savedIds={savedIds}
        onSave={onSave}
        onShopClick={onShopClick}
        searchQuery={searchQuery}
      />
    : view === "table" && offers.length > 1 ?
      <CompareTable
        products={offers}
        savedIds={savedIds}
        onSave={onSave}
        onShopClick={onShopClick}
        catalogId={offers[0]?.catalogId}
        searchQuery={searchQuery}
      />
    : <ProductGrid
        products={offers}
        savedIds={savedIds}
        onSave={onSave}
        onShopClick={onShopClick}
        layout={layout}
      />;

  return (
    <div className="mt-4 w-full max-w-full space-y-4">
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
                  : `About ${formatPrice(matched.fromPrice!)} — estimates below`}
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

      {!compareMode && <div className="flex items-center justify-end"><ViewToggle /></div>}

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
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <Truck size={22} className="text-sage-700" />
              </div>
              <div className="min-w-0">
                <h4 className="text-base font-bold text-stone-900 sm:text-lg">
                  {results.linkMatch?.useExactCompare ?
                    "Verified equivalent offers"
                  : "Verified live offers"} ({online.length})
                </h4>
                <p className="mt-0.5 text-xs text-stone-600 sm:text-sm">
                  {results.linkMatch?.useExactCompare ?
                    "Same product across stores · explainable match confidence"
                  : "Scraped or API prices · PDP links"} · ships to {zipCode}
                </p>
              </div>
            </div>
            {compareMode && online.length > 1 && <ViewToggle />}
          </div>
          {renderOffers(online)}
        </section>
      )}

      {showEstimatedOffersInUi() && estimatedOnline.length > 0 && (
        <section className="flex min-w-0 flex-col rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50/80 p-4 sm:p-5">
          <div className="mb-4 flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
              <AlertTriangle size={22} className="text-amber-700" />
            </div>
            <div className="min-w-0">
              <h4 className="text-base font-bold text-stone-800 sm:text-lg">
                Estimated / unverified ({estimatedOnline.length})
              </h4>
              <p className="mt-0.5 text-xs text-stone-600 sm:text-sm">
                Not ranked with verified prices · open store to confirm
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
                Low confidence / filtered ({lowConfidenceOnline.length})
              </h4>
              <p className="mt-0.5 text-xs text-amber-800 sm:text-sm">
                Debug view — offers retrieved but failed verification gates
              </p>
            </div>
          </div>
          {renderOffers(lowConfidenceOnline)}
        </section>
      )}

      {results.searchDebug && searchDebugEnabledClient() && (
        <SearchPipelineDebugPanel debug={results.searchDebug} />
      )}

      {online.length === 0 && showEstimatedOffersInUi() && estimatedOnline.length > 0 && (
        <p className="text-center text-sm text-amber-800">
          No verified live prices yet — run search again or check estimated offers below.
        </p>
      )}
    </div>
  );
}
