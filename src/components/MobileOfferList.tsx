"use client";

import type { ProductOffer } from "@/lib/types";
import { ProductImage } from "./ProductImage";
import { OutboundLink } from "./OutboundLink";
import { FreshnessIndicator } from "./FreshnessIndicator";
import { formatPrice } from "@/lib/utils/format";
import { ChevronRight } from "lucide-react";

interface MobileOfferListProps {
  offers: ProductOffer[];
  onShopClick?: (offer: ProductOffer) => void;
  searchQuery?: string;
}

/**
 * Compact, phone-friendly results list. Instead of a grid of big photo cards
 * (too heavy on a small screen), each offer is a single tappable row: a small
 * product photo on the left, then the store, product name, when it was last
 * verified, and the price on the right. Used only below `lg`; desktop keeps the
 * full card/compare layout.
 */
export function MobileOfferList({ offers, onShopClick, searchQuery }: MobileOfferListProps) {
  if (!offers.length) return null;

  return (
    <ul className="flex flex-col divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      {offers.map((offer, i) => {
        const delivered = offer.deliveredTotal ?? offer.landedCost ?? offer.price;
        const showDelivered = delivered > offer.price + 0.01;
        return (
          <li key={offer.id}>
            <OutboundLink
              offer={offer}
              context={{ source: "mobile_list", searchQuery }}
              onNavigate={onShopClick}
              className="flex items-center gap-3 px-3 py-3 transition active:bg-stone-50"
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-stone-50 ring-1 ring-stone-100">
                <ProductImage
                  src={offer.imageUrl}
                  alt={offer.title}
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-stone-900">
                    {offer.retailerName}
                  </span>
                  {i === 0 && (
                    <span className="shrink-0 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Best
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">{offer.title}</p>
                <div className="mt-1">
                  <FreshnessIndicator offer={offer} compact />
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end pl-1">
                <span className="text-base font-extrabold leading-none text-stone-900">
                  {formatPrice(offer.price)}
                </span>
                {showDelivered && (
                  <span className="mt-1 text-[11px] text-stone-400">
                    ≈ {formatPrice(delivered)} delivered
                  </span>
                )}
                <ChevronRight size={16} className="mt-1 text-stone-300" aria-hidden />
              </div>
            </OutboundLink>
          </li>
        );
      })}
    </ul>
  );
}
