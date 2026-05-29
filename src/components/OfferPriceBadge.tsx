"use client";

import type { ProductOffer } from "@/lib/types";
import { getOfferPriceDisplay } from "@/lib/shopping/offer-price-display";
import { formatVerificationCount } from "@/lib/shopping/deal-display";
import { scrapeAgeBadge } from "@/lib/shopping/offer-price-badges";
import { ShieldCheck, AlertCircle, HelpCircle, TrendingDown } from "lucide-react";

interface OfferPriceBadgeProps {
  offer: ProductOffer;
}

export function OfferPriceBadge({ offer }: OfferPriceBadgeProps) {
  const display = getOfferPriceDisplay(offer);
  const age = scrapeAgeBadge(offer);
  const verifyCount = formatVerificationCount(offer);
  const badge =
    display.badgeLabel ??
    (display.trustTier === "verified" ? "VERIFIED PRICE" : "ESTIMATED");

  const styles =
    badge === "VERIFIED PRICE" ?
      "bg-emerald-600 text-white"
    : badge === "PRICE UNAVAILABLE" ?
      "bg-amber-700 text-white"
    : "bg-stone-700/90 text-white";

  const Icon =
    offer.dealLabel === "best_deal" || offer.isGoodDeal ? TrendingDown
    : badge === "VERIFIED PRICE" ? ShieldCheck
    : badge === "PRICE UNAVAILABLE" ? HelpCircle
    : AlertCircle;

  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={`flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide shadow ${styles}`}
      >
        <Icon size={11} className="shrink-0" />
        <span className="truncate">{badge}</span>
      </span>
      {display.lastVerifiedLabel && (
        <span className="rounded bg-stone-900/75 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-white">
          {display.lastVerifiedLabel}
        </span>
      )}
      {verifyCount && (
        <span className="rounded bg-emerald-900/80 px-1.5 py-0.5 text-[8px] font-semibold text-white">
          {verifyCount}
        </span>
      )}
      {age && !display.lastVerifiedLabel && (
        <span className="rounded bg-stone-900/75 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-white">
          {age}
        </span>
      )}
    </div>
  );
}
