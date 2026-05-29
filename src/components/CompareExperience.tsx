"use client";

import { useEffect } from "react";
import type { ProductOffer, ProductSearchResults } from "@/lib/types";
import { shouldShowBestDealBadge } from "@/lib/offers/offer-trust";
import { getOfferPriceDisplay } from "@/lib/shopping/offer-price-display";
import { formatPrice } from "@/lib/utils/format";
import { getRetailerMeta } from "@/lib/retailers/meta";
import { Trophy, TrendingDown } from "lucide-react";
import { ProductImage } from "./ProductImage";
import { RetailerTrustBadge } from "./RetailerTrustBadge";
import { PriceHistoryMiniChart } from "./PriceHistoryMiniChart";
import { BestDealExplainer } from "./BestDealExplainer";
import { OutboundLink } from "./OutboundLink";
import { OfferFeedback } from "./OfferFeedback";
import { CompareTable } from "./CompareTable";
import { useExperiment } from "@/lib/experiments/useExperiment";
import { trackEvent } from "@/lib/analytics/track-client";

interface CompareExperienceProps {
  results: ProductSearchResults;
  savedIds?: Set<string>;
  onSave?: (offer: ProductOffer) => void;
  onShopClick?: (offer: ProductOffer) => void;
  searchQuery?: string;
}

function SavingsLine({ offer, variant }: { offer: ProductOffer; variant: string }) {
  if (offer.percentBelowMarket != null && offer.percentBelowMarket >= 3) {
    if (variant === "dollar" && offer.movingAvgPrice && offer.movingAvgPrice > offer.price) {
      const saved = offer.movingAvgPrice - offer.price;
      return (
        <p className="text-sm font-semibold text-emerald-700">
          Save {formatPrice(saved)} vs typical price
        </p>
      );
    }
    return (
      <p className="text-sm font-semibold text-emerald-700">
        {offer.percentBelowMarket}% below market average
      </p>
    );
  }
  return null;
}

function CompareCard({
  offer,
  rank,
  savingsVariant,
  trustVariant,
  onSave,
  saved,
  onShopClick,
  searchQuery,
  catalogId,
}: {
  offer: ProductOffer;
  rank: number;
  savingsVariant: string;
  trustVariant: string;
  onSave?: (offer: ProductOffer) => void;
  saved?: boolean;
  onShopClick?: (offer: ProductOffer) => void;
  searchQuery?: string;
  catalogId?: string;
}) {
  const meta = getRetailerMeta(offer.retailer);
  const priceDisplay = getOfferPriceDisplay(offer);
  const isBest = shouldShowBestDealBadge(offer);

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        isBest ? "border-sage-400 ring-2 ring-sage-200" : "border-stone-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
          style={{ backgroundColor: meta.color }}
          aria-hidden
        >
          #{rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-stone-900">{offer.retailerName}</p>
            {isBest && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sage-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                <Trophy size={10} /> Best deal
              </span>
            )}
            {trustVariant === "badge" ?
              <RetailerTrustBadge offer={offer} compact />
            : null}
          </div>
          {trustVariant === "inline" && (
            <p className="mt-0.5 text-xs text-stone-500">
              {priceDisplay.trustedMatchLabel ?? priceDisplay.trustLabel}
            </p>
          )}
          <p className="mt-1 text-2xl font-bold text-stone-900">{priceDisplay.main}</p>
          <SavingsLine offer={offer} variant={savingsVariant} />
          {offer.wasPrice && offer.wasPrice > offer.price && (
            <p className="text-xs text-stone-400 line-through">
              Was {formatPrice(offer.wasPrice)}
            </p>
          )}
        </div>
        {isBest && offer.priceHistorySparkline && offer.priceHistorySparkline.length >= 2 && (
          <div className="hidden shrink-0 rounded-lg border border-stone-100 bg-stone-50 p-2 sm:block">
            <PriceHistoryMiniChart
              points={offer.priceHistorySparkline}
              current={offer.price}
            />
          </div>
        )}
      </div>

      {isBest && (
        <BestDealExplainer offer={offer} defaultOpen className="mt-3" />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <OutboundLink
          offer={offer}
          context={{ source: "compare", catalogId, searchQuery }}
          onNavigate={onShopClick}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sage-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sage-700 sm:flex-none"
        >
          Shop at {offer.retailerName}
        </OutboundLink>
        {onSave && (
          <button
            type="button"
            onClick={() => onSave(offer)}
            className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm text-stone-600 hover:bg-stone-50"
            aria-label={saved ? "Remove from watchlist" : "Save to watchlist"}
          >
            {saved ? "Saved" : "Watch"}
          </button>
        )}
      </div>

      <OfferFeedback offer={offer} catalogId={catalogId} className="mt-3" />
    </article>
  );
}

export function CompareExperience({
  results,
  savedIds = new Set(),
  onSave,
  onShopClick,
  searchQuery,
}: CompareExperienceProps) {
  const layout = useExperiment("compare_layout");
  const savingsVariant = useExperiment("savings_copy");
  const trustVariant = useExperiment("trust_placement");

  const offers = [...results.online].sort((a, b) => a.price - b.price);
  const matched = results.matchedProduct;
  const catalogId = offers[0]?.catalogId ?? results.enrichmentCatalogId;

  useEffect(() => {
    trackEvent({
      name: "compare_view",
      properties: {
        catalogId,
        query: searchQuery,
        offerCount: offers.length,
        layout,
      },
    });
  }, [catalogId, searchQuery, offers.length, layout]);

  if (!offers.length) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
        <TrendingDown className="mx-auto mb-3 text-stone-400" size={32} />
        <p className="font-medium text-stone-800">No verified prices yet</p>
        <p className="mt-1 text-sm text-stone-500">
          We&apos;re still checking stores. Try again in a moment or search in chat.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {matched && (
        <header className="flex gap-4 rounded-2xl border border-stone-200 bg-white p-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-stone-100">
            <ProductImage src={matched.imageUrl} alt={matched.title} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Comparing prices for
            </p>
            <h1 className="font-homy text-lg font-bold text-stone-900 sm:text-xl">
              {matched.title}
            </h1>
            <p className="text-sm text-stone-600">{matched.brand}</p>
            <p className="mt-1 text-sm text-stone-500">
              {offers.length} verified store{offers.length === 1 ? "" : "s"} · ships to {results.zipCode}
            </p>
          </div>
        </header>
      )}

      {layout === "table" && offers.length > 1 ?
        <CompareTable
          products={offers}
          savedIds={savedIds}
          onSave={onSave}
          onShopClick={onShopClick}
          catalogId={catalogId}
          searchQuery={searchQuery}
        />
      : <div className="space-y-3">
          {offers.map((offer, i) => (
            <CompareCard
              key={offer.id}
              offer={offer}
              rank={i + 1}
              savingsVariant={savingsVariant}
              trustVariant={trustVariant}
              onSave={onSave}
              saved={savedIds.has(offer.id)}
              onShopClick={onShopClick}
              searchQuery={searchQuery}
              catalogId={catalogId}
            />
          ))}
        </div>
      }
    </div>
  );
}
