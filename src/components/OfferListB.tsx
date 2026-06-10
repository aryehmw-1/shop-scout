"use client";

import type { ProductOffer } from "@/lib/types";
import { ProductImage } from "./ProductImage";
import { OutboundLink } from "./OutboundLink";
import { FreshnessIndicator } from "./FreshnessIndicator";
import { formatPrice } from "@/lib/utils/format";
import { Crown, ExternalLink, TrendingDown } from "lucide-react";

/**
 * Single, honest shipping statement for an offer. We never double up with a
 * "delivered" figure — the user sees EITHER free shipping OR a cost OR, when we
 * genuinely can't know it up front (Amazon), a "Shipping at checkout" note.
 */
export function offerShipping(o: ProductOffer): { text: string; free: boolean } {
  if (o.freeShippingEligible) return { text: "Free shipping", free: true };
  const isAmazon =
    o.retailer === "amazon" || (o.retailerName ?? "").toLowerCase().includes("amazon");
  if (isAmazon) return { text: "Shipping at checkout", free: false };
  const ship = o.estimatedShipping;
  if (ship === 0) return { text: "Free shipping", free: true };
  if (ship != null && ship > 0) {
    return { text: `+${formatPrice(ship)} est. shipping`, free: false };
  }
  return { text: "", free: false };
}

/** Highest delivered price across the set — used to show how much you save. */
function maxDelivered(offers: ProductOffer[]): number {
  return Math.max(
    ...offers.map((o) => o.deliveredTotal ?? o.landedCost ?? o.price),
  );
}

interface OfferListBProps {
  offers: ProductOffer[];
  onShopClick?: (offer: ProductOffer) => void;
  searchQuery?: string;
}

/**
 * Desktop "Option B" results layout (variant B-2): a roomy row per offer with a
 * big product photo, the store + savings, an honest shipping line, and the
 * price pinned to the far right above a "View at store" button. Used at `lg`+;
 * phones use the compact `MobileOfferList`.
 */
export function DesktopOfferListB({ offers, onShopClick, searchQuery }: OfferListBProps) {
  if (!offers.length) return null;
  const highest = maxDelivered(offers);

  return (
    <div className="space-y-3">
      {offers.map((offer, i) => {
        const best = i === 0;
        const delivered = offer.deliveredTotal ?? offer.landedCost ?? offer.price;
        const save = highest - delivered;
        const ship = offerShipping(offer);
        const pctBelow = offer.percentBelowMarket
          ? Math.round(offer.percentBelowMarket)
          : 0;
        return (
          <div
            key={offer.id}
            className={`relative flex items-center gap-5 rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
              best ? "border-orange-300 ring-1 ring-orange-200/70" : "border-stone-200"
            }`}
          >
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-50 ring-1 ring-stone-100">
              <ProductImage
                src={offer.imageUrl}
                alt={offer.title}
                className="h-full w-full object-cover"
              />
              {best && (
                <span className="absolute left-0 top-0 inline-flex items-center gap-0.5 rounded-br-xl bg-gradient-to-r from-orange-500 to-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  <Crown size={10} aria-hidden /> Best
                </span>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-stone-100 px-2 py-0.5 text-sm font-bold text-stone-700">
                  {offer.retailerName}
                </span>
                {save > 0.01 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                    <TrendingDown size={11} aria-hidden /> save {formatPrice(save)}
                  </span>
                )}
              </div>
              <p className="truncate text-sm text-stone-500">{offer.title}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <FreshnessIndicator offer={offer} compact />
                {ship.text && (
                  <span
                    className={
                      ship.free ? "font-semibold text-emerald-600" : "font-medium text-stone-500"
                    }
                  >
                    {ship.text}
                  </span>
                )}
                {pctBelow > 0 && (
                  <span className="font-medium text-emerald-600">{pctBelow}% below market</span>
                )}
              </div>
            </div>

            {/* Far right: price on top, "View at store" beneath it. */}
            <div className="flex shrink-0 flex-col items-end gap-2 pl-2 text-right">
              <span className="text-3xl font-extrabold leading-none text-stone-900">
                {formatPrice(offer.price)}
              </span>
              <OutboundLink
                offer={offer}
                context={{ source: "card", searchQuery }}
                onNavigate={onShopClick}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-sm transition ${
                  best
                    ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                    : "bg-stone-800 hover:bg-stone-900"
                }`}
              >
                View at store
                <ExternalLink size={15} aria-hidden />
              </OutboundLink>
            </div>
          </div>
        );
      })}
    </div>
  );
}
