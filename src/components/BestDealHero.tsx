"use client";

import type { ProductOffer } from "@/lib/types";
import { formatPrice } from "@/lib/utils/format";
import { Trophy, Sparkles } from "lucide-react";
import { BestDealExplainer } from "./BestDealExplainer";
import { GoodTimeToBuy } from "./GoodTimeToBuy";
import { PriceHistoryMiniChart } from "./PriceHistoryMiniChart";
import { OutboundLink } from "./OutboundLink";
import { useExperiment } from "@/lib/experiments/useExperiment";

interface BestDealHeroProps {
  offer: ProductOffer;
  onShopClick?: (offer: ProductOffer) => void;
}

export function BestDealHero({ offer, onShopClick }: BestDealHeroProps) {
  const bannerVariant = useExperiment("best_deal_banner");
  const savingsVariant = useExperiment("savings_copy");
  const explainVariant = useExperiment("explain_ux");

  if (!offer.price || offer.price <= 0) return null;

  const savingsCopy =
    savingsVariant === "dollar" &&
    offer.movingAvgPrice &&
    offer.movingAvgPrice > offer.price ?
      `Save ${formatPrice(offer.movingAvgPrice - offer.price)} vs typical price`
    : offer.percentBelowMarket != null && offer.percentBelowMarket > 0 ?
      `Save ${offer.percentBelowMarket}% vs market average`
    : null;

  if (bannerVariant === "compact") {
    return (
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sage-300 bg-sage-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-sage-800">Best price</p>
          <p className="font-semibold text-stone-900">
            {formatPrice(offer.price)} · {offer.retailerName}
          </p>
          {savingsCopy && (
            <p className="text-xs font-medium text-emerald-700">{savingsCopy}</p>
          )}
        </div>
        <OutboundLink
          offer={offer}
          context={{ source: "hero" }}
          onNavigate={onShopClick}
          className="shrink-0 rounded-xl bg-sage-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sage-700"
        >
          View price
        </OutboundLink>
      </section>
    );
  }

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border-2 border-sage-500 bg-gradient-to-br from-sage-50 via-white to-emerald-50/80 p-4 shadow-md sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-600 text-white shadow">
              <Trophy size={18} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-sage-800">
                Best price
              </p>
              <p className="text-lg font-bold text-stone-900 sm:text-xl">
                {formatPrice(offer.price)} at {offer.retailerName}
              </p>
            </div>
          </div>

          {savingsCopy && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
              <Sparkles size={14} />
              {savingsCopy}
            </p>
          )}

          <GoodTimeToBuy offer={offer} className="mt-2" />
        </div>

        {offer.priceHistorySparkline && offer.priceHistorySparkline.length >= 2 && (
          <div className="shrink-0 rounded-xl border border-sage-200/80 bg-white/90 p-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
              Price trend
            </p>
            <PriceHistoryMiniChart
              points={offer.priceHistorySparkline}
              current={offer.price}
            />
          </div>
        )}
      </div>

      <BestDealExplainer
        offer={offer}
        className="mt-4"
        defaultOpen={explainVariant === "open"}
      />

      <div className="mt-4">
        <OutboundLink
          offer={offer}
          context={{ source: "hero" }}
          onNavigate={onShopClick}
          className="inline-flex w-full items-center justify-center rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white hover:bg-sage-700 sm:w-auto sm:px-6"
        >
          View at {offer.retailerName}
        </OutboundLink>
      </div>
    </section>
  );
}
