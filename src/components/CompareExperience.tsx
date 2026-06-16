"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ProductOffer, ProductSearchResults, SimilarProduct } from "@/lib/types";
import { shouldShowBestDealBadge } from "@/lib/offers/offer-trust";
import { getOfferPriceDisplay } from "@/lib/shopping/offer-price-display";
import { formatPrice } from "@/lib/utils/format";
import { getRetailerMeta } from "@/lib/retailers/meta";
import { CheckCircle2, Sparkles, ExternalLink, Heart, Info, Trophy, TrendingDown } from "lucide-react";
import { ProductImage } from "./ProductImage";
import { similarToOffer } from "./SimilarAlternatives";
import { PhotoSourceLabel } from "./PhotoSourceLabel";
import { RetailerTrustBadge } from "./RetailerTrustBadge";
import { PriceHistoryMiniChart } from "./PriceHistoryMiniChart";
import { OutboundLink } from "./OutboundLink";
import { OfferFeedback } from "./OfferFeedback";
import { CompareTable } from "./CompareTable";
import { DeliveredPriceBreakdown } from "./DeliveredPriceBreakdown";
import { FreshnessIndicator } from "./FreshnessIndicator";
import { TrustSummaryCard } from "./trust/TrustSummaryCard";
import { useExperiment } from "@/lib/experiments/useExperiment";
import { trackEvent } from "@/lib/analytics/track-client";

interface CompareExperienceProps {
  results: ProductSearchResults;
  savedIds?: Set<string>;
  onSave?: (offer: ProductOffer) => void;
  onShopClick?: (offer: ProductOffer) => void;
  searchQuery?: string;
  /** Side-by-side retailer cards (compare page) vs stacked list (chat). */
  layoutMode?: "stack" | "grid";
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

function comparePriceMain(offer: ProductOffer, display: { main: string }): string {
  if (display.main === "Check retailer" && offer.price > 0) {
    return `~${formatPrice(offer.price)}`;
  }
  return display.main;
}

/**
 * Shipping shown as a first-class, readable line — never tiny gray text. Surfaces
 * the most trust-building fact (free with membership / free over threshold /
 * unknown) right where the eye lands, so a $6.99 estimate never looks hidden.
 */
function ShippingLabel({ offer }: { offer: ProductOffer }) {
  const shipping = offer.estimatedShipping ?? offer.deliveryFee;

  if (offer.memberPricingApplied && shipping === 0) {
    return <span className="text-violet-700">Free with membership</span>;
  }
  if (shipping === 0) {
    return <span className="text-emerald-700">Free shipping</span>;
  }
  if (offer.freeShippingEligible && offer.freeShippingThreshold) {
    return (
      <>
        + {shipping != null ? formatPrice(shipping) : "—"} shipping ·{" "}
        <span className="text-emerald-700">
          free over {formatPrice(offer.freeShippingThreshold)}
        </span>
      </>
    );
  }
  if (shipping == null) {
    return <span className="text-stone-500">Shipping unknown</span>;
  }
  return <>+ {formatPrice(shipping)} shipping</>;
}

/**
 * Confidence tag for the estimated delivered total — degrades gracefully so a
 * low-confidence guess is never presented as a hard fact.
 */
function DeliveredConfidenceLabel({ offer }: { offer: ProductOffer }) {
  const shipping = offer.estimatedShipping ?? offer.deliveryFee;
  const confidence = offer.deliveredPriceConfidence;
  let label: string | null = null;
  if (shipping == null) {
    label = "Shipping unknown — total may vary";
  } else if (confidence != null) {
    label =
      confidence >= 0.75 ? "Strong estimate"
      : confidence >= 0.55 ? "Estimated"
      : "Rough estimate — add ZIP";
  }
  if (!label) return null;
  return <p className="mt-1 text-[11px] text-stone-400">{label}</p>;
}

function ProductIdentityHeader({
  matched,
  bestOffer,
  zipCode,
  liveSourceLabel,
  offerCountLabel,
}: {
  matched?: ProductSearchResults["matchedProduct"];
  bestOffer: ProductOffer;
  zipCode: string;
  liveSourceLabel: string;
  offerCountLabel: string;
}) {
  const title = matched?.title ?? bestOffer.storeTitle ?? `${bestOffer.brand} ${bestOffer.title}`;
  const brand = matched?.brand ?? bestOffer.brand;
  const image = matched?.imageUrl ?? bestOffer.imageUrl;
  const matchLabel =
    bestOffer.matchDisplayLabel ??
    (bestOffer.matchBand === "exact_verified" ? "Exact product match" : "Product match");

  return (
    <header className="grid gap-4 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm sm:grid-cols-[116px_1fr] sm:p-5 lg:grid-cols-[132px_1fr]">
      <div className="relative mx-auto h-40 w-40 overflow-hidden rounded-2xl border border-stone-100 bg-stone-50 sm:mx-0 sm:h-[116px] sm:w-[116px] lg:h-[132px] lg:w-[132px]">
        <ProductImage
          src={image}
          alt={title}
          retailerId={bestOffer.retailer}
          className="h-full w-full object-contain p-3"
        />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">
          {liveSourceLabel}
        </p>
        <h1 className="font-homy mt-1 text-2xl font-bold leading-tight text-stone-950 sm:text-3xl">
          {title}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-sage-50 px-2.5 py-1 text-xs font-semibold text-sage-800">
            <CheckCircle2 size={13} aria-hidden />
            {matchLabel}
          </span>
          {bestOffer.packSizeLabel || bestOffer.size ? (
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
              {bestOffer.packSizeLabel ?? bestOffer.size}
            </span>
          ) : null}
          <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800">
            {offerCountLabel}
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
            Ships to {zipCode}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          <span>{brand}</span>
          <PhotoSourceLabel source={matched?.imageSource ?? bestOffer.imageSource} />
        </div>
      </div>
    </header>
  );
}

/** A single EXACT-match offer as its own self-contained shopping card (L5). Photo
 *  is prominent, price is the first thing the eye lands on, freshness + verified
 *  trust are visible, and "Go to store" is the clear primary action. */
function ExactOfferCard({
  offer,
  rank,
  matched,
  onSave,
  saved,
  onShopClick,
  searchQuery,
  catalogId,
}: {
  offer: ProductOffer;
  rank: number;
  matched?: ProductSearchResults["matchedProduct"];
  onSave?: (offer: ProductOffer) => void;
  saved?: boolean;
  onShopClick?: (offer: ProductOffer) => void;
  searchQuery?: string;
  catalogId?: string;
}) {
  const meta = getRetailerMeta(offer.retailer);
  const priceDisplay = getOfferPriceDisplay(offer);
  const isBest = rank === 1;
  const image = offer.imageUrl || matched?.imageUrl || "";
  const productName = matched?.title ?? offer.storeTitle ?? `${offer.brand} ${offer.title}`;

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${
        isBest ? "border-sage-400 ring-2 ring-sage-200" : "border-stone-200"
      }`}
    >
      {/* Prominent product photo */}
      <div className="relative flex items-center justify-center bg-stone-50 p-5">
        <div className="h-36 w-36 overflow-hidden rounded-xl">
          <ProductImage
            src={image}
            alt={productName}
            retailerId={offer.retailer}
            className="h-full w-full object-contain"
          />
        </div>
        {isBest && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
            <Trophy size={11} aria-hidden /> Lowest price
          </span>
        )}
        {/* Heart (save) — replaces the old "Save" text button */}
        {onSave && (
          <button
            type="button"
            onClick={() => onSave(offer)}
            aria-label={saved ? "Remove from saved" : "Save product"}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-stone-200 hover:bg-white"
          >
            <Heart
              size={18}
              className={saved ? "text-red-500" : "text-stone-400"}
              fill={saved ? "currentColor" : "none"}
            />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {/* Product name — one of the most obvious elements on the card */}
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-stone-900">
          {productName}
        </h3>

        {/* Retailer + freshness */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold text-white"
              style={{ backgroundColor: meta.color }}
              aria-hidden
            >
              {meta.shortName.slice(0, 2).toUpperCase()}
            </span>
            <p className="truncate font-bold text-stone-900">{offer.retailerName}</p>
          </div>
          <FreshnessIndicator offer={offer} compact />
        </div>

        {/* Price — first thing the eye lands on */}
        <p className="mt-3 text-3xl font-black leading-none text-stone-950">
          {comparePriceMain(offer, priceDisplay)}
        </p>
        {offer.wasPrice && offer.wasPrice > offer.price && (
          <p className="mt-1 text-xs text-stone-400 line-through">
            Was {formatPrice(offer.wasPrice)}
          </p>
        )}
        {/* When shipping is unknown, DeliveredConfidenceLabel already says
            "Shipping unknown — total may vary", so don't also print a bare
            "Shipping unknown" above it (avoids the duplicate line). */}
        {(offer.estimatedShipping ?? offer.deliveryFee) != null && (
          <p className="mt-1 text-sm font-medium text-stone-700">
            <ShippingLabel offer={offer} />
          </p>
        )}
        <DeliveredConfidenceLabel offer={offer} />

        {/* Trust */}
        <div className="mt-2">
          <RetailerTrustBadge offer={offer} compact />
        </div>

        {/* Action — Go to store (full width; saving is the heart on the photo) */}
        <div className="mt-4">
          <OutboundLink
            offer={offer}
            context={{ source: "compare", catalogId, searchQuery }}
            onNavigate={onShopClick}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white ${
              isBest
                ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:opacity-95"
                : "bg-stone-900 hover:bg-stone-800"
            }`}
          >
            Go to store
            <ExternalLink size={14} aria-hidden />
          </OutboundLink>
        </div>
      </div>
    </article>
  );
}

/** Similar products — a GROUPED/connected rail (deliberately not separate cards),
 *  so they read as alternatives rather than true matches for the searched item. */
function SimilarRail({
  similar,
  onShopClick,
  searchQuery,
}: {
  similar: SimilarProduct[];
  onShopClick?: (offer: ProductOffer) => void;
  searchQuery?: string;
}) {
  const items = [...similar].sort((a, b) => a.price - b.price).slice(0, 6);
  if (!items.length) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-stone-100 bg-stone-50/80 px-4 py-3">
        <Sparkles size={15} className="shrink-0 text-stone-500" aria-hidden />
        <p className="font-bold text-stone-900">
          Similar products{" "}
          <span className="font-normal text-stone-500">— not the same item</span>
        </p>
      </div>
      <div className="divide-y divide-stone-100">
        {items.map((s) => {
          const offer = similarToOffer(s);
          return (
            <div key={s.catalogId} className="flex items-center gap-4 px-4 py-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-stone-100 bg-stone-50">
                <ProductImage
                  src={s.imageUrl}
                  alt={s.title}
                  retailerId={s.retailer}
                  className="h-full w-full object-contain p-1"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-semibold text-stone-900">{s.title}</p>
                <p className="text-xs text-stone-500">{s.retailerName}</p>
              </div>
              <p className="shrink-0 text-lg font-extrabold text-sage-800">{formatPrice(s.price)}</p>
              <OutboundLink
                offer={offer}
                context={{ source: "compare", searchQuery }}
                onNavigate={onShopClick}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                View
                <ExternalLink size={12} aria-hidden />
              </OutboundLink>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BestOfferAnswer({
  offer,
  onShopClick,
  searchQuery,
  catalogId,
}: {
  offer: ProductOffer;
  onShopClick?: (offer: ProductOffer) => void;
  searchQuery?: string;
  catalogId?: string;
}) {
  const meta = getRetailerMeta(offer.retailer);
  const priceDisplay = getOfferPriceDisplay(offer);
  const deliveredTotal = offer.deliveredTotal ?? offer.landedCost;
  const hasDeliveredPrice =
    deliveredTotal != null && deliveredTotal > 0 && Math.abs(deliveredTotal - offer.price) > 0.009;
  const mainPrice =
    hasDeliveredPrice ? formatPrice(deliveredTotal) : comparePriceMain(offer, priceDisplay);
  const reason =
    hasDeliveredPrice ?
      "Lowest delivered price in this comparison. We include shipping when the provider gives it to us."
    : "Lowest price in this comparison. Offers are sorted from cheapest to most expensive.";

  return (
    <section className="rounded-2xl border border-sage-200 bg-sage-50/80 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[10px] font-bold text-white"
              style={{ backgroundColor: meta.color }}
              aria-hidden
            >
              {meta.shortName.slice(0, 2).toUpperCase()}
            </span>
            <p className="font-bold text-sage-950">
              {offer.retailerName} has the lowest {hasDeliveredPrice ? "delivered " : ""}price right now
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-sage-700 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              <Trophy size={10} aria-hidden />
              {hasDeliveredPrice ? "Best delivered" : "Lowest price"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-sage-900/85">{reason}</p>
        </div>
        <div className="flex shrink-0 items-start gap-3 sm:text-right">
          <div className="sm:text-right">
            {/* Anchor: the retailer's advertised item price — matches click-through */}
            <p className="text-3xl font-black leading-none text-stone-950">
              {comparePriceMain(offer, priceDisplay)}
            </p>
            <p className="mt-1 text-xs font-semibold text-sage-800">Item price</p>

            {/* Shipping — first-class, readable, not gray micro-text */}
            <p className="mt-2 text-sm font-medium text-stone-700">
              <ShippingLabel offer={offer} />
            </p>

            {/* Estimated delivered — secondary, clearly derived & an estimate */}
            {hasDeliveredPrice && (
              <p className="mt-1 text-sm font-semibold text-stone-900">
                Est. delivered ≈ {mainPrice}
              </p>
            )}
            <DeliveredConfidenceLabel offer={offer} />
          </div>
          <OutboundLink
            offer={offer}
            context={{ source: "compare", catalogId, searchQuery }}
            onNavigate={onShopClick}
            className="inline-flex items-center justify-center rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sage-800"
          >
            View
          </OutboundLink>
        </div>
      </div>
    </section>
  );
}

function RetailerOfferRow({
  offer,
  rank,
  onSave,
  saved,
  onShopClick,
  searchQuery,
  catalogId,
}: {
  offer: ProductOffer;
  rank: number;
  onSave?: (offer: ProductOffer) => void;
  saved?: boolean;
  onShopClick?: (offer: ProductOffer) => void;
  searchQuery?: string;
  catalogId?: string;
}) {
  const meta = getRetailerMeta(offer.retailer);
  const priceDisplay = getOfferPriceDisplay(offer);
  const deliveredTotal = offer.deliveredTotal ?? offer.landedCost;
  const hasDeliveredPrice =
    deliveredTotal != null && deliveredTotal > 0 && Math.abs(deliveredTotal - offer.price) > 0.009;
  const mainPrice =
    hasDeliveredPrice ? formatPrice(deliveredTotal) : comparePriceMain(offer, priceDisplay);
  const isBest = rank === 1;
  const checkedAt = offer.lastVerifiedAt ?? offer.priceAsOf;
  const checkedLabel =
    checkedAt ?
      new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(checkedAt))
    : null;
  const sourceParts = [
    offer.sourceLabel ?? offer.priceNote,
    checkedLabel ? `checked ${checkedLabel}` : null,
    offer.sellerName ? `seller ${offer.sellerName}` : null,
    offer.condition,
  ].filter(Boolean);

  return (
    <article
      className={`grid gap-3 border-t border-stone-100 px-4 py-4 sm:grid-cols-[1.2fr_0.75fr_1fr_auto] sm:items-center ${
        isBest ? "bg-sage-50/40" : "bg-white"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold text-white"
          style={{ backgroundColor: meta.color }}
          aria-hidden
        >
          {meta.shortName.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-stone-900">{offer.retailerName}</h3>
            {isBest && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sage-700 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                <Trophy size={10} aria-hidden />
                Lowest
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-stone-500">
            {offer.storeTitle ?? `${offer.brand} ${offer.title}`}
          </p>
          {sourceParts.length ? (
            <p className="mt-1 text-[11px] leading-snug text-stone-500">
              {sourceParts.join(" · ")}
            </p>
          ) : null}
          {offer.returnPolicy ? (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-stone-400">
              {offer.returnPolicy}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        {/* Anchor: advertised item price */}
        <p className="text-2xl font-black leading-tight text-stone-950">
          {comparePriceMain(offer, priceDisplay)}
        </p>
        {offer.wasPrice && offer.wasPrice > offer.price && (
          <p className="text-xs text-stone-400 line-through">
            Was {formatPrice(offer.wasPrice)}
          </p>
        )}
        {/* Shipping — readable, equal weight */}
        <p className="mt-1 text-sm font-medium text-stone-700">
          <ShippingLabel offer={offer} />
        </p>
        {/* Estimated delivered — secondary */}
        {hasDeliveredPrice ? (
          <p className="mt-0.5 text-sm font-semibold text-stone-900">
            Est. delivered ≈ {mainPrice}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-stone-500">{priceDisplay.sub}</p>
        )}
        <DeliveredConfidenceLabel offer={offer} />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <FreshnessIndicator offer={offer} compact />
          <RetailerTrustBadge offer={offer} compact />
        </div>
        <DeliveredPriceBreakdown offer={offer} compact />
      </div>

      <div className="flex items-center gap-2 sm:justify-end">
        {onSave && (
          <button
            type="button"
            onClick={() => onSave(offer)}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
            aria-label={saved ? "Remove from watchlist" : "Save to watchlist"}
          >
            {saved ? "Saved" : "Save"}
          </button>
        )}
        <OutboundLink
          offer={offer}
          context={{ source: "compare", catalogId, searchQuery }}
          onNavigate={onShopClick}
          className="inline-flex items-center justify-center rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800"
        >
          View
        </OutboundLink>
      </div>
    </article>
  );
}

function PriceExplanationCard({
  offers,
  bestOffer,
}: {
  offers: ProductOffer[];
  bestOffer: ProductOffer;
}) {
  const nextOffer = offers[1];
  const bestTotal = bestOffer.deliveredTotal ?? bestOffer.landedCost ?? bestOffer.price;
  const nextTotal = nextOffer ? nextOffer.deliveredTotal ?? nextOffer.landedCost ?? nextOffer.price : null;
  const priceGap =
    nextTotal != null && nextTotal > bestTotal ?
      nextTotal - bestTotal
    : null;
  const shipping = bestOffer.estimatedShipping ?? bestOffer.deliveryFee;
  const usesDeliveredPrice =
    bestTotal > 0 && Math.abs(bestTotal - bestOffer.price) > 0.009;

  return (
    <section className="h-full rounded-2xl border border-sage-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="flex items-center gap-2 font-bold text-stone-950">
        <Info size={18} className="text-sage-700" aria-hidden />
        Why this price
      </p>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">
        {bestOffer.retailerName} is shown first because it has the lowest{" "}
        {usesDeliveredPrice ? "delivered total" : "listed price"} in this comparison at{" "}
        {formatPrice(bestTotal)}.
      </p>
      {usesDeliveredPrice && shipping != null && (
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          That is item price {formatPrice(bestOffer.price)} plus{" "}
          {shipping === 0 ? "free shipping" : `${formatPrice(shipping)} shipping`}.
        </p>
      )}
      {nextOffer && priceGap != null && (
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          The next closest option is {formatPrice(nextTotal ?? nextOffer.price)} at{" "}
          {nextOffer.retailerName}, which is {formatPrice(priceGap)} more.
        </p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-stone-500">
        If a row says estimated, open the retailer page to confirm the current
        price before checking out.
      </p>
    </section>
  );
}

/**
 * Compare results layout. MOBILE/TABLET (<lg) keeps the ORIGINAL evidence layout
 * (best-offer hero + "Why this price" + connected rows) — unchanged. DESKTOP (lg+)
 * uses the newer L5 design: each exact match is its own separate, spaced card and
 * similar products show as a grouped rail.
 */
function CompareEvidenceLayout({
  offers,
  matched,
  savedIds,
  onSave,
  onShopClick,
  searchQuery,
  catalogId,
  zipCode,
  similar,
}: {
  offers: ProductOffer[];
  matched?: ProductSearchResults["matchedProduct"];
  savedIds: Set<string>;
  onSave?: (offer: ProductOffer) => void;
  onShopClick?: (offer: ProductOffer) => void;
  searchQuery?: string;
  catalogId?: string;
  zipCode: string;
  similar?: SimilarProduct[];
}) {
  const bestOffer = offers[0];
  if (!bestOffer) return null;
  const remainingOffers = offers.slice(1);
  const allEbay = offers.every((offer) => offer.providerSource === "ebay");
  const allProvider = offers.every((offer) => Boolean(offer.providerSource));
  const liveSourceLabel =
    allEbay ? "Live eBay marketplace pricing"
    : allProvider ? "Live provider pricing"
    : "One product. We compare for you.";
  const offerCountLabel =
    allEbay ?
      `${offers.length} verified eBay offer${offers.length === 1 ? "" : "s"}`
    : `${offers.length} offer${offers.length === 1 ? "" : "s"} checked`;

  return (
    <div className="space-y-5">
      <ProductIdentityHeader
        matched={matched}
        bestOffer={bestOffer}
        zipCode={zipCode}
        liveSourceLabel={liveSourceLabel}
        offerCountLabel={offerCountLabel}
      />

      {/* ── MOBILE / TABLET (<lg): original evidence layout, unchanged ── */}
      <div className="space-y-4 lg:hidden">
        <div className="grid gap-4">
          <BestOfferAnswer
            offer={bestOffer}
            onShopClick={onShopClick}
            searchQuery={searchQuery}
            catalogId={catalogId}
          />
          <PriceExplanationCard offers={offers} bestOffer={bestOffer} />
        </div>
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 bg-stone-50/80 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-bold text-stone-950">Other places to buy it</h2>
              <p className="text-xs text-stone-500">
                Cheapest delivered price first when shipping is known.
              </p>
            </div>
            <p className="text-xs font-semibold text-stone-500">
              {remainingOffers.length} more offer{remainingOffers.length === 1 ? "" : "s"}
            </p>
          </div>
          {remainingOffers.length ? (
            remainingOffers.map((offer, i) => (
              <RetailerOfferRow
                key={offer.id}
                offer={offer}
                rank={i + 2}
                saved={savedIds.has(offer.id)}
                onSave={onSave}
                onShopClick={onShopClick}
                searchQuery={searchQuery}
                catalogId={catalogId}
              />
            ))
          ) : (
            <p className="border-t border-stone-100 px-4 py-4 text-sm text-stone-500">
              We only found one place to buy this right now.
            </p>
          )}
        </section>
      </div>

      {/* ── DESKTOP (lg+): L5 — separate exact-match cards + grouped similar rail ── */}
      <div className="hidden space-y-5 lg:block">
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="font-bold text-stone-950">Where to buy it — cheapest first</h2>
            <p className="text-xs font-semibold text-stone-500">
              {offers.length} exact-match offer{offers.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {offers.map((offer, i) => (
              <ExactOfferCard
                key={offer.id}
                offer={offer}
                rank={i + 1}
                matched={matched}
                saved={savedIds.has(offer.id)}
                onSave={onSave}
                onShopClick={onShopClick}
                searchQuery={searchQuery}
                catalogId={catalogId}
              />
            ))}
          </div>
        </section>

        {similar && similar.length > 0 && (
          <SimilarRail similar={similar} onShopClick={onShopClick} searchQuery={searchQuery} />
        )}
      </div>
    </div>
  );
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
  layoutMode = "stack",
}: CompareExperienceProps) {
  const experimentLayout = useExperiment("compare_layout");
  const savingsVariant = useExperiment("savings_copy");
  const trustVariant = useExperiment("trust_placement");
  const useGrid = layoutMode === "grid";
  const useTable = !useGrid && experimentLayout === "table";

  // EXACT match comparison: the 5 lowest-priced offers, sorted low→high by the
  // REAL item price. Shipping/tax are estimates and must never reorder offers
  // (a fabricated shipping fee was previously flipping the cheapest-first order).
  const offers = useMemo(
    () =>
      [...results.online]
        .sort((a, b) => {
          const ap = a.price && a.price > 0 ? a.price : Number.POSITIVE_INFINITY;
          const bp = b.price && b.price > 0 ? b.price : Number.POSITIVE_INFINITY;
          return ap - bp;
        })
        .slice(0, 5),
    [results.online],
  );
  const matched = results.matchedProduct;
  const catalogId = offers[0]?.catalogId ?? results.enrichmentCatalogId;
  const trackedView = useRef<string | null>(null);

  useEffect(() => {
    const key = `${catalogId ?? ""}:${searchQuery ?? ""}:${offers.length}`;
    if (trackedView.current === key) return;
    trackedView.current = key;
    trackEvent({
      name: "compare_view",
      properties: {
        catalogId,
        query: searchQuery,
        offerCount: offers.length,
        layout: useGrid ? "grid" : experimentLayout,
      },
    });
  }, [catalogId, searchQuery, offers.length, useGrid, experimentLayout]);

  if (!offers.length) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
        <TrendingDown className="mx-auto mb-3 text-stone-400" size={32} />
        <p className="font-medium text-stone-800">No compare pricing yet</p>
        <p className="mt-1 text-sm text-stone-500">
          Try a product name from inventory or search in chat.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {results.intelligenceInsight && !useGrid && (
        <TrustSummaryCard insight={results.intelligenceInsight} />
      )}

      {matched && !useGrid && (
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
              {offers.length} store{offers.length === 1 ? "" : "s"} · ships to {results.zipCode}
            </p>
          </div>
        </header>
      )}

      {useTable && offers.length > 1 ?
        <CompareTable
          products={offers}
          savedIds={savedIds}
          onSave={onSave}
          onShopClick={onShopClick}
          catalogId={catalogId}
          searchQuery={searchQuery}
        />
      : useGrid ?
        <CompareEvidenceLayout
          offers={offers}
          matched={matched}
          savedIds={savedIds}
          onSave={onSave}
          onShopClick={onShopClick}
          searchQuery={searchQuery}
          catalogId={catalogId}
          zipCode={results.zipCode}
          similar={results.similar}
        />
      : (
        <div className="space-y-3">
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
      )}
    </div>
  );
}
