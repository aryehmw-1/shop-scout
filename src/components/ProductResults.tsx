"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductOffer, ProductSearchResults } from "@/lib/types";
import { prepareResultsForDisplay } from "@/lib/offers/offer-ranking";
import { showEstimatedOffersInUi } from "@/lib/offers/offer-persist-validation";
import { cheapestVerifiedPrice } from "@/lib/search/price-truth";
import { formatPrice } from "@/lib/utils/format";
import { ProductGrid } from "./ProductGrid";
import { CompareTable } from "./CompareTable";
import { ProductImage } from "./ProductImage";
import { PhotoSourceLabel } from "./PhotoSourceLabel";
import { LayoutGrid, List, Truck, AlertTriangle, Loader2, ExternalLink, Search, ChevronDown } from "lucide-react";
import Link from "next/link";
import { LinkProductHero } from "./LinkProductHero";
import { trackEvent } from "@/lib/analytics/track-client";
import { CompareExperience } from "./CompareExperience";
import {
  SearchPipelineDebugPanel,
  searchDebugEnabledClient,
} from "./SearchPipelineDebugPanel";
import { ConversationDebugPanel } from "./ConversationDebugPanel";
import { buildRetrievalTrustDiagnostic } from "@/lib/search/retrieval-trust-message";
import { ProductRequestForm } from "./ProductRequestForm";
import { MobileOfferList, MobileVerifiedNote } from "./MobileOfferList";
import { SimilarAlternatives, similarToOffer } from "./SimilarAlternatives";
import { DesktopOfferListB } from "./OfferListB";
import { VerifiedCompareHeader } from "./search/VerifiedCompareHeader";
import { CatalogFreshnessBanner } from "./FreshnessIndicator";
import { inferQueryCategoryFamily } from "@/lib/inventory/category-coverage";
import { CATALOG } from "@/lib/retailers/catalog";
import { matchLooksIrrelevant } from "@/lib/search/relevance";

const VIEW_STORAGE_KEY = "shop-scout-results-view";

/**
 * Liquid-volume "size" classes for grocery items (milk, juice, etc.). The
 * clothing size parser doesn't understand gallons/quarts, so when a user asks
 * for a specific volume ("half a gallon") we detect it here. Ordered so the
 * more specific "half gallon" is checked before the generic "gallon" (which is
 * a substring of it).
 */
const VOLUME_CLASSES: { id: string; label: string; patterns: RegExp[] }[] = [
  {
    id: "half-gallon",
    label: "half gallon",
    patterns: [/half[\s-]*gallons?/i, /\bhalf a gallon\b/i, /\b1\/2\s*gal/i, /\b64\s*(?:fl\s*)?oz\b/i],
  },
  { id: "quart", label: "quart", patterns: [/\bquarts?\b/i, /\b32\s*(?:fl\s*)?oz\b/i] },
  { id: "pint", label: "pint", patterns: [/\bpints?\b/i, /\b16\s*(?:fl\s*)?oz\b/i] },
  {
    id: "gallon",
    label: "gallon",
    patterns: [/\bgallons?\b/i, /\b1\s*gal\b/i, /\b128\s*(?:fl\s*)?oz\b/i],
  },
];

function volumeClassOf(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  for (const cls of VOLUME_CLASSES) {
    if (cls.patterns.some((re) => re.test(text))) return cls.id;
  }
  return undefined;
}

/**
 * True when the query explicitly asks for a liquid volume (e.g. "half a
 * gallon") but none of the offers are that volume — so we should NOT show the
 * wrong-size product card. We surface the request form instead.
 */
function requestedVolumeMissing(
  query: string | undefined,
  offers: ProductOffer[],
  matchedTitle?: string,
): boolean {
  const want = volumeClassOf(query);
  if (!want) return false;
  const haystacks = [matchedTitle, ...offers.map((o) => `${o.brand ?? ""} ${o.title ?? ""}`)];
  return !haystacks.some((h) => volumeClassOf(h) === want);
}

function ResultsViewToggle({
  view,
  onChange,
  className = "",
}: {
  view: "cards" | "table";
  onChange: (next: "cards" | "table") => void;
  className?: string;
}) {
  return (
    <div
      className={`flex rounded-lg border border-stone-200 bg-white p-0.5 ${className}`}
      role="group"
      aria-label="Results layout"
    >
      <button
        type="button"
        onClick={() => onChange("cards")}
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
        onClick={() => onChange("table")}
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
}

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
  const display =
    results.estimatedOnline !== undefined ?
      results
    : prepareResultsForDisplay(results, { searchQuery });
  const { online: rawOnline, estimatedOnline = [], lowConfidenceOnline = [], zipCode, compareMode, referenceProduct, similarMode, similar: similarAlternatives = [] } =
    display;
  const online = useMemo(
    () =>
      [...rawOnline].sort((a, b) => {
        const aDelivered = a.deliveredTotal ?? a.landedCost ?? a.price;
        const bDelivered = b.deliveredTotal ?? b.landedCost ?? b.price;
        const aPrice = aDelivered > 0 ? aDelivered : Number.POSITIVE_INFINITY;
        const bPrice = bDelivered > 0 ? bDelivered : Number.POSITIVE_INFINITY;
        return aPrice - bPrice;
      }).slice(0, 5),
    [rawOnline],
  );
  const queryFamily = inferQueryCategoryFamily(searchQuery ?? results.matchedProduct?.title);
  const hasLowConfidence = (lowConfidenceOnline?.length ?? 0) > 0;
  const showLowConfidence =
    hasLowConfidence &&
    (searchDebugEnabledClient() ||
      showEstimatedOffersInUi() ||
      queryFamily === "apparel");

  const defaultView = "cards";
  const [view, setView] = useState<"cards" | "table">(defaultView);
  const [viewReady, setViewReady] = useState(false);
  // User opted to see the available size even though it doesn't match the
  // volume they asked for (e.g. show gallon milk after requesting half-gallon).
  const [showMismatchAnyway, setShowMismatchAnyway] = useState(false);
  // Version C: when we have similar alternatives, the request form stays collapsed
  // behind a button so users review alternatives first (keeps the page clean).
  const [showRequestForm, setShowRequestForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const stored = sessionStorage.getItem(VIEW_STORAGE_KEY);
        if (stored === "cards" || stored === "table") {
          setView(stored);
        }
      } catch {
        /* ignore */
      }
      setViewReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setViewPersisted = useCallback((next: "cards" | "table") => {
    setView(next);
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  // Spurious-match guard: if the catalog returned an unrelated product, treat it
  // as a no-match so the user gets the "request this product" path instead of a
  // wrong card. Trust pasted-link / compare-reference flows untouched.
  const trustedExactFlow = Boolean(referenceProduct || similarMode);
  const irrelevantMatch =
    !trustedExactFlow &&
    matchLooksIrrelevant(searchQuery, [...online, ...estimatedOnline]);

  // Variant guard: the user asked for a specific liquid volume (e.g. "half a
  // gallon") but we only have a different size (e.g. 1 gal). Don't show the
  // wrong-size card — offer the request form, with an opt-in to view what we do
  // carry. `showMismatchAnyway` lets the user override and see the card.
  const volumeMissing =
    !trustedExactFlow &&
    !showMismatchAnyway &&
    requestedVolumeMissing(searchQuery, [...online, ...estimatedOnline], results.matchedProduct?.title);

  if (
    irrelevantMatch ||
    volumeMissing ||
    (!online.length && !estimatedOnline.length && !showLowConfidence)
  ) {
    // Prefer the clean, server-resolved product name over the raw user message
    // (which may be a long sentence or contain a pasted URL).
    const cleanedSearch = (() => {
      if (!searchQuery) return "";
      const stripped = searchQuery.replace(/https?:\/\/\S+/gi, "").trim();
      // If it still reads like a sentence, don't dump it as the product name.
      if (stripped.length > 60 || stripped.split(/\s+/).length > 9) return "";
      return stripped;
    })();
    // When the match was rejected as irrelevant or is the wrong size, the
    // resolved title is the WRONG product — fall back to what the user typed.
    const q = irrelevantMatch || volumeMissing
      ? cleanedSearch || results.resolvedQuery?.trim() || ""
      : results.resolvedQuery?.trim() ||
        results.matchedProduct?.title ||
        cleanedSearch ||
        "";
    // For a volume mismatch we DO have the product in another size — name it so
    // we can offer to show it instead of pretending we have nothing.
    const availableVolumeLabel = volumeMissing
      ? VOLUME_CLASSES.find(
          (c) => c.id === volumeClassOf(`${online[0]?.brand ?? ""} ${online[0]?.title ?? ""}`),
        )?.label
      : undefined;
    const hasSimilar = similarAlternatives.length > 0;
    return (
      <div className="mt-4 space-y-4">
        {/* Case 1 — no exact match but we DO have relevant alternatives: lead with
            them, clearly labelled, and make the request form secondary. */}
        {hasSimilar && (
          <div className="rounded-2xl border border-orange-200/70 bg-cream-50/60 px-4 py-4">
            <p className="mb-1 text-base font-semibold text-stone-900">
              We couldn&apos;t find an exact match{q ? <> for <span className="text-stone-900">{q}</span></> : null}.
            </p>
            <p className="mb-1 text-xs text-stone-500">
              Here are similar products you might like instead.
            </p>
            <SimilarAlternatives similar={similarAlternatives} exactCount={0} searchQuery={searchQuery} onSave={onSave} savedIds={savedIds} />
          </div>
        )}
        {/* Case 1 (similar exist) → collapsible request CTA so the form is opt-in. */}
        {hasSimilar ? (
          <div className="rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3">
            <button
              type="button"
              onClick={() => setShowRequestForm((v) => !v)}
              aria-expanded={showRequestForm}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                <Search size={16} className="text-stone-400" aria-hidden />
                Can&apos;t find what you&apos;re looking for? Request this exact product
              </span>
              <ChevronDown
                size={18}
                className={`shrink-0 text-stone-400 transition-transform ${showRequestForm ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {showRequestForm && (
              <div className="mt-3 border-t border-stone-200 pt-3">
                <ProductRequestForm searchQuery={q} />
              </div>
            )}
          </div>
        ) : (
        <div className="rounded-2xl border border-stone-200 bg-stone-50/80 px-5 py-5 space-y-4">
          {volumeMissing && q ? (
            <p className="text-sm text-stone-600 leading-relaxed">
              We don&apos;t carry{" "}
              <span className="font-semibold text-stone-800">{q}</span>{" "}
              in that size yet — only{" "}
              <span className="font-semibold text-stone-800">
                {availableVolumeLabel ?? "a different size"}
              </span>
              {" "}is in our catalog right now.
            </p>
          ) : (
            <p className="text-base font-semibold text-stone-900 leading-relaxed">
              {q ? (
                <>
                  I couldn&apos;t find{" "}
                  <span className="text-stone-900">{q}</span>{" "}
                  in Homivion&apos;s catalog yet.
                </>
              ) : (
                <>I couldn&apos;t find that product in Homivion&apos;s catalog yet.</>
              )}
            </p>
          )}
          <ProductRequestForm searchQuery={q} />
          <a
            href="/inventory"
            className="inline-flex items-center gap-1 text-sm font-semibold text-orange-700 underline-offset-2 hover:underline"
          >
            Browse available products
          </a>
          {volumeMissing && online.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMismatchAnyway(true)}
              className="block text-sm font-semibold text-orange-700 underline-offset-2 hover:underline"
            >
              Show the {availableVolumeLabel ?? "available size"} we do have instead
            </button>
          )}
        </div>
        )}
        {results.searchDebug && searchDebugEnabledClient() && (
          <SearchPipelineDebugPanel debug={results.searchDebug} />
        )}
        {conversationDebug && searchDebugEnabledClient() && (
          <ConversationDebugPanel debug={conversationDebug} />
        )}
      </div>
    );
  }

  const matched = display.matchedProduct;
  const verifiedFrom = cheapestVerifiedPrice(display);
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
    online[0]?.catalogId ?
      `/compare?product=${encodeURIComponent(online[0].catalogId)}`
    : compareQuery ?
      `/compare?q=${encodeURIComponent(compareQuery)}`
    : null;

  const renderOffers = (offers: ProductOffer[], layout: "grid" | "carousel" = "grid") => {
    if (!offers.length) return null;

    if (compareMode) {
      return (
        <CompareExperience
          results={{ ...display, online: offers }}
          savedIds={savedIds}
          onSave={onSave}
          onShopClick={onShopClick}
          searchQuery={searchQuery}
          layoutMode="grid"
        />
      );
    }

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

  // Category-style result: the query resolved to a SINGLE product with a single
  // seller (so there's no price comparison to show) but we DO have several other
  // products that match the query — e.g. "soap" → many distinct soaps. Rather
  // than show one "exact" item and bury the rest under "Similar", present them
  // together as a list of matching products and keep a couple as similar.
  // (compareMode is the DEFAULT for searches and doesn't change the main list
  // render, so we don't exclude it — otherwise this never triggers.)
  const MAX_MATCHING = 5;
  const isCategoryResult =
    !similarMode &&
    !results.linkMatch &&
    online.length === 1 &&
    similarAlternatives.length >= 2;
  // Matching products = the exact item first, then similar products, capped.
  const matchingOffers = isCategoryResult
    ? [online[0], ...similarAlternatives.map(similarToOffer)].slice(0, MAX_MATCHING)
    : [];
  // Whatever didn't make the matching list stays as "Similar" (≥2 by construction).
  const leftoverSimilar = isCategoryResult
    ? similarAlternatives.slice(MAX_MATCHING - 1)
    : similarAlternatives;

  return (
    <div className="mt-4 w-full max-w-full space-y-4">
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

      {compareHref && online.length > 0 && !compareMode && (
        <div className="flex justify-end">
          <Link
            href={compareHref}
            onClick={() =>
              trackEvent({
                name: "product_clicked",
                properties: { productId: online[0]?.catalogId, query: searchQuery },
              })
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm font-semibold text-sage-800 shadow-sm hover:border-sage-400 hover:bg-sage-50"
          >
            Open full compare view
            <ExternalLink size={14} aria-hidden />
          </Link>
        </div>
      )}

      {matched && !similarMode && !compareMode && (
        <div className="hidden gap-4 rounded-2xl border border-orange-200/80 bg-cream-50/90 p-4 sm:p-5 lg:flex">
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
          <ResultsViewToggle view={view} onChange={setViewPersisted} />
        </div>
      )}

      {(enriching || results.enrichmentPending) && (
        <div className="flex items-center gap-2 rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm text-sage-800">
          <Loader2 size={16} className="animate-spin shrink-0" />
          Checking more stores for better prices…
        </div>
      )}

      {online.length > 0 && isCategoryResult && (
        <section className="mx-auto flex w-full max-w-2xl min-w-0 flex-col rounded-2xl border-2 border-sage-400/70 bg-sage-50/30 p-2 sm:p-5">
          {/* Category-style result: several distinct products that match the
              query, shown as a list of options (no single "Best price" badge —
              these are different products, not sellers of the same item). */}
          <div className="mb-2 flex items-center gap-2 px-1 text-[12px] font-semibold text-sage-800">
            Matching products
            <span className="font-normal text-stone-500">— verified live prices</span>
          </div>
          <MobileOfferList
            offers={matchingOffers}
            onShopClick={onShopClick}
            searchQuery={searchQuery}
            variant="matching"
            onSave={onSave}
            savedIds={savedIds}
          />
        </section>
      )}

      {online.length > 0 && !isCategoryResult && (
        <section className="mx-auto flex w-full max-w-2xl min-w-0 flex-col rounded-2xl border-2 border-sage-400/70 bg-sage-50/30 p-2 sm:p-5">
          {/* One layout everywhere — the compact "iPhone" card list, on mobile and
              desktop alike (same verified-prices note, same card, heart on the
              right, price on the left). */}
          <MobileVerifiedNote
            zipCode={zipCode}
            estimated={Boolean(display.closestMatchFallback)}
          />
          <MobileOfferList
            offers={online}
            onShopClick={onShopClick}
            searchQuery={searchQuery}
            onSave={onSave}
            savedIds={savedIds}
          />
        </section>
      )}

      {leftoverSimilar.length > 0 &&
        !(display.matchTiers?.similar?.length ?? 0) && (
          <SimilarAlternatives
            similar={leftoverSimilar}
            exactCount={isCategoryResult ? matchingOffers.length : online.length}
            searchQuery={searchQuery}
            onSave={onSave}
            savedIds={savedIds}
          />
        )}

      {display.catalogFreshnessWarning &&
        (online.length > 0 || estimatedOnline.length > 0) && (
          <CatalogFreshnessBanner
            message={display.catalogFreshnessWarning.message}
            staleCount={display.catalogFreshnessWarning.staleCount}
            totalCount={display.catalogFreshnessWarning.totalCount}
          />
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



      {online.length === 0 && showEstimatedOffersInUi() && estimatedOnline.length > 0 && (
        <p className="text-center text-sm text-amber-800">
          No verified live prices yet — check estimated offers below or try a more specific search.
        </p>
      )}
    </div>
  );
}
