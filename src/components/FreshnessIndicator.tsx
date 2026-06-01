"use client";

import type { ProductOffer } from "@/lib/types";
import { classifyOfferFreshness } from "@/lib/pricing/quote-freshness-policy";
import { Clock, AlertTriangle } from "lucide-react";

const TIER_STYLES = {
  fresh: "bg-emerald-50 text-emerald-800 border-emerald-200",
  aging: "bg-amber-50 text-amber-900 border-amber-200",
  stale_visible: "bg-orange-50 text-orange-900 border-orange-200",
  expired: "bg-stone-100 text-stone-600 border-stone-200",
} as const;

interface FreshnessIndicatorProps {
  offer: ProductOffer;
  compact?: boolean;
  className?: string;
}

export function FreshnessIndicator({ offer, compact, className = "" }: FreshnessIndicatorProps) {
  const meta = classifyOfferFreshness(offer);
  const tier = offer.freshnessTier ?? meta.tier;
  const label = offer.freshnessLabel ?? meta.shortLabel;
  const styles = TIER_STYLES[tier] ?? TIER_STYLES.stale_visible;

  if (tier === "fresh" && compact) return null;

  const Icon = tier === "stale_visible" || tier === "expired" ? AlertTriangle : Clock;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles} ${className}`}
      title={meta.displayLabel}
    >
      <Icon size={10} aria-hidden />
      {compact ? label : meta.displayLabel}
    </span>
  );
}

interface CatalogFreshnessBannerProps {
  message: string;
  staleCount: number;
  totalCount: number;
}

export function CatalogFreshnessBanner({
  message,
  staleCount,
  totalCount,
}: CatalogFreshnessBannerProps) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950"
      role="status"
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
      <div>
        <p className="font-semibold">Prices may be outdated</p>
        <p className="mt-0.5 text-xs leading-relaxed">{message}</p>
        <p className="mt-1 text-[10px] text-amber-800/80">
          {staleCount} of {totalCount} offers in stale/expired tier · last refresh may be overdue
        </p>
      </div>
    </div>
  );
}
