"use client";

import type { ProductOffer } from "@/lib/types";
import { getOfferPriceDisplay } from "@/lib/shopping/offer-price-display";
import { shouldShowBestDealBadge } from "@/lib/offers/offer-trust";
import { formatPrice } from "@/lib/utils/format";
import { getRetailerMeta } from "@/lib/retailers/meta";
import { ExternalLink, Heart } from "lucide-react";
import { ProductImage } from "./ProductImage";
import { PhotoSourceLabel } from "./PhotoSourceLabel";
import { OfferPriceBadge } from "./OfferPriceBadge";
import { RetailerTrustBadge } from "./RetailerTrustBadge";
import { OfferInspectionPanel } from "./OfferInspectionPanel";
import { OutboundLink } from "./OutboundLink";
import { DeliveredPriceBreakdown } from "./DeliveredPriceBreakdown";
import { OfferFeedback } from "./OfferFeedback";
import { FreshnessIndicator } from "./FreshnessIndicator";
import { OfferConfidenceChip } from "./trust/OfferConfidenceChip";
import { useExperiment } from "@/lib/experiments/useExperiment";

interface ProductCardProps {
  offer: ProductOffer;
  onSave?: (id: string) => void;
  onShopClick?: (offer: ProductOffer) => void;
  saved?: boolean;
  layout?: "grid" | "carousel";
}

export function ProductCard({
  offer,
  onSave,
  onShopClick,
  saved,
  layout = "carousel",
}: ProductCardProps) {
  const meta = getRetailerMeta(offer.retailer);
  const priceDisplay = getOfferPriceDisplay(offer);
  const showBestDeal = shouldShowBestDealBadge(offer);
  const isEstimated = priceDisplay.trustTier === "estimated";
  const isUnavailable = priceDisplay.trustTier === "unavailable";
  const trustPlacement = useExperiment("trust_placement");
  const logoFallback = (offer.pipelineDebug?.imageFallbackLevel ?? 0) >= 5;
  const displayMain = priceDisplay.main?.trim() || "Check retailer";
  const intelConfidence = offer.matchConfidence ?? 0;
  const intelBand =
    intelConfidence >= 0.72 ? "high"
    : intelConfidence >= 0.52 ? "medium"
    : "low";
  const showIntelChip =
    intelConfidence >= 0.52 &&
    (offer.priceSource === "catalog_model" || offer.matchBand === "exact_verified");

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
        isEstimated || isUnavailable
          ? "border-stone-200/90 border-dashed"
          : "border-sage-200/90"
      } ${layout === "grid" ? "w-full min-w-0" : "w-[240px] shrink-0"}`}
    >
      <div className="relative aspect-square bg-gradient-to-br from-stone-100 to-stone-50">
        <ProductImage
          src={offer.imageUrl}
          alt={offer.storeTitle ?? `${offer.brand} ${offer.title}`}
          className={`absolute inset-0 h-full w-full ${
            logoFallback ? "object-contain p-8" : "object-cover"
          }`}
          retailerId={offer.retailer}
        />
        {showBestDeal && (
          <span className="absolute left-2 top-2 rounded-full bg-sage-600 px-2.5 py-1 text-xs font-bold text-white shadow">
            Best Deal
          </span>
        )}
        {!showBestDeal && offer.isGoodDeal && offer.percentBelowMarket != null && (
          <span className="absolute left-2 top-2 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow">
            {offer.percentBelowMarket}% below market
          </span>
        )}
        <div className="absolute right-2 top-2">
          <OfferPriceBadge offer={offer} />
        </div>
        {offer.savingsPercent && offer.savingsPercent > 0 && !showBestDeal && !offer.isGoodDeal && (
          <span className="absolute left-2 bottom-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
            -{offer.savingsPercent}%
          </span>
        )}
        {!offer.inStock && (
          <span className="absolute inset-0 flex items-center justify-center bg-stone-900/40 text-sm font-medium text-white">
            Low stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[9px] font-bold text-white"
            style={{ backgroundColor: meta.color }}
          >
            {meta.shortName.slice(0, 2).toUpperCase()}
          </span>
          <span className="truncate text-xs font-semibold text-stone-500">
            {offer.retailerName}
          </span>
          {trustPlacement === "badge" && <RetailerTrustBadge offer={offer} compact />}
          {showIntelChip && (
            <OfferConfidenceChip
              confidence={intelConfidence}
              band={intelBand}
              compact
            />
          )}
        </div>
        {trustPlacement === "inline" && (
          <p className="text-[10px] text-stone-500">
            {priceDisplay.trustedMatchLabel ?? priceDisplay.trustLabel}
          </p>
        )}

        <h3
          className={`line-clamp-2 font-semibold leading-snug text-stone-800 ${
            layout === "grid" ? "text-xs sm:text-sm" : "text-sm"
          }`}
        >
          {offer.storeTitle ?? `${offer.brand} ${offer.title}`}
        </h3>
        {offer.packSizeLabel ? (
          <p className="text-[10px] font-medium uppercase tracking-wide text-stone-500">
            {offer.packSizeLabel}
          </p>
        ) : offer.size ? (
          <p className="text-[10px] font-medium uppercase tracking-wide text-stone-500">
            {offer.size}
          </p>
        ) : null}
        <PhotoSourceLabel source={offer.imageSource} className="mt-0.5" />
        {offer.pipelineDebug?.imageFallbackLevel != null && (
          <p className="text-[10px] text-stone-400">
            Image: level {offer.pipelineDebug.imageFallbackLevel}
            {offer.pipelineDebug.imageExtractionMethod ?
              ` · ${offer.pipelineDebug.imageExtractionMethod}`
            : ""}
          </p>
        )}
        <p
          className={`text-[11px] leading-snug ${
            priceDisplay.trustTier === "verified"
              ? "text-sage-700"
              : "text-amber-800/90"
          }`}
        >
          {priceDisplay.trustedMatchLabel ?? priceDisplay.trustLabel}
        </p>

        <div className="mt-auto flex items-baseline gap-2">
          <p
            className={`font-bold text-stone-900 ${
              priceDisplay.main.length > 12 ? "text-lg" : "text-xl sm:text-2xl"
            } ${isEstimated || isUnavailable ? "text-stone-700" : ""}`}
          >
            {displayMain}
          </p>
          {priceDisplay.showWasPrice && offer.movingAvgPrice && offer.movingAvgPrice > offer.price && (
            <p className="text-sm text-stone-400 line-through">
              {formatPrice(offer.movingAvgPrice)}
            </p>
          )}
        </div>
        <p className="text-[11px] leading-snug text-stone-500">
          {priceDisplay.dealHeadline ?? priceDisplay.sub}
        </p>
        <FreshnessIndicator offer={offer} compact className="self-start" />
        <DeliveredPriceBreakdown offer={offer} compact={layout === "carousel"} />
        {priceDisplay.marketComparison && (
          <p className="text-[10px] font-medium text-emerald-700">
            {priceDisplay.marketComparison}
          </p>
        )}
        {priceDisplay.lastVerifiedLabel && (
          <p className="text-[10px] text-stone-400">{priceDisplay.lastVerifiedLabel}</p>
        )}

        <OfferInspectionPanel offer={offer} />
        <OfferFeedback offer={offer} className="mt-1" />

        <div className="flex gap-2 pt-2">
          <OutboundLink
            offer={offer}
            context={{ source: "card" }}
            onNavigate={onShopClick}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white transition ${
              isEstimated || isUnavailable
                ? "bg-stone-600 hover:bg-stone-700"
                : "bg-sage-600 hover:bg-sage-700"
            }`}
          >
            {isEstimated ? "Check at store" : "View product"}
            <ExternalLink size={14} />
          </OutboundLink>
          {onSave && (
            <button
              type="button"
              onClick={() => onSave(offer.id)}
              className={`rounded-xl border px-3 py-2 transition ${
                saved
                  ? "border-red-200 bg-red-50 text-red-500"
                  : "border-stone-200 text-stone-400 hover:border-stone-300 hover:text-red-400"
              }`}
              aria-label={saved ? "Unsave" : "Save deal"}
            >
              <Heart size={18} fill={saved ? "currentColor" : "none"} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
