"use client";

import type { ProductOffer } from "@/lib/types";
import { ProductImage } from "./ProductImage";
import { OutboundLink } from "./OutboundLink";
import { FreshnessIndicator } from "./FreshnessIndicator";
import { offerShipping } from "./OfferListB";
import { formatPrice } from "@/lib/utils/format";
import { Crown, ExternalLink, ShieldCheck, TrendingDown } from "lucide-react";

/**
 * Compact, phone-only "verified pricing" note (format V-2). Shows a single
 * trust line so products/prices lead the screen; the pack-size fairness
 * explanation is tucked behind a tappable disclosure ("Why trust this ›").
 * Replaces the full-height VerifiedCompareHeader on phones.
 */
export function MobileVerifiedNote({
  zipCode,
  estimated,
}: {
  zipCode?: string;
  estimated?: boolean;
}) {
  return (
    <details className="group mb-3 rounded-lg bg-white/70 ring-1 ring-sage-200">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] font-semibold text-sage-800">
        <ShieldCheck size={14} className="shrink-0 text-sage-600" aria-hidden />
        {estimated ? "Estimated prices" : "Verified live prices"}
        {zipCode ? ` · ships to ${zipCode}` : ""}
        <span className="ml-auto text-sage-500 group-open:hidden">Why trust this ›</span>
      </summary>
      <p className="px-3 pb-2.5 text-[11px] leading-snug text-stone-500">
        {estimated
          ? "These are modeled catalog prices — confirm the exact pack size on the retailer before buying."
          : "We compare pack sizes fairly so you're not misled by multipacks or variety boxes."}
      </p>
    </details>
  );
}

interface MobileOfferListProps {
  offers: ProductOffer[];
  onShopClick?: (offer: ProductOffer) => void;
  searchQuery?: string;
}

/**
 * Compact, phone-friendly "Option B" results list. Each offer is a single
 * tappable card: a product photo (with a "Best" ribbon on the leader), the
 * store + verified badge, product name, the price with a savings pill, an
 * honest shipping line, and a "View" pill. Used only below `lg`; desktop uses
 * the roomier `DesktopOfferListB`.
 */
export function MobileOfferList({ offers, onShopClick, searchQuery }: MobileOfferListProps) {
  if (!offers.length) return null;
  const highest = Math.max(
    ...offers.map((o) => o.deliveredTotal ?? o.landedCost ?? o.price),
  );

  return (
    <div className="space-y-2">
      {offers.map((offer, i) => {
        const best = i === 0;
        const delivered = offer.deliveredTotal ?? offer.landedCost ?? offer.price;
        const save = highest - delivered;
        const ship = offerShipping(offer);
        const pctBelow = offer.percentBelowMarket
          ? Math.round(offer.percentBelowMarket)
          : 0;
        return (
          <OutboundLink
            key={offer.id}
            offer={offer}
            context={{ source: "mobile_list", searchQuery }}
            onNavigate={onShopClick}
            className={`relative flex gap-2.5 rounded-xl border bg-white p-2 shadow-sm transition active:bg-stone-50 ${
              best ? "border-orange-300 ring-1 ring-orange-200/70" : "border-stone-200"
            }`}
          >
            <div className="relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-lg bg-stone-50 ring-1 ring-stone-100">
              <ProductImage
                src={offer.imageUrl}
                alt={offer.title}
                className="h-full w-full object-cover"
              />
              {best && (
                <span className="absolute left-0 top-0 inline-flex items-center gap-0.5 rounded-br-lg bg-gradient-to-r from-orange-500 to-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                  <Crown size={9} aria-hidden /> Best
                </span>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1.5">
                <span className="truncate rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-bold text-stone-700">
                  {offer.retailerName}
                </span>
                <FreshnessIndicator offer={offer} compact />
              </div>
              <p className="mt-0.5 line-clamp-1 text-[12px] text-stone-500">{offer.title}</p>

              <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-extrabold leading-none text-stone-900">
                      {formatPrice(offer.price)}
                    </span>
                    {save > 0.01 && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        <TrendingDown size={10} aria-hidden /> {formatPrice(save)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-stone-400">
                    {ship.text && (
                      <span className={ship.free ? "font-medium text-emerald-600" : "text-stone-500"}>
                        {ship.text}
                      </span>
                    )}
                    {ship.text && pctBelow > 0 && <span className="text-stone-300">·</span>}
                    {pctBelow > 0 && (
                      <span className="font-medium text-emerald-600">{pctBelow}% under</span>
                    )}
                  </div>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-sm ${
                    best
                      ? "bg-gradient-to-r from-orange-500 to-amber-500"
                      : "bg-stone-800"
                  }`}
                >
                  View
                  <ExternalLink size={12} aria-hidden />
                </span>
              </div>
            </div>
          </OutboundLink>
        );
      })}
    </div>
  );
}
