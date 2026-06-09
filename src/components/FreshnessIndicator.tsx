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

/**
 * A quiet, trust-building freshness note shown BELOW the results (not above) so
 * products appear immediately. The copy is conversational and reassuring rather
 * than alarming: we confirm these prices were verified recently and invite the
 * user to double-check at the retailer — without burying the deals.
 */
export function CatalogFreshnessBanner({
  staleCount,
  totalCount,
}: CatalogFreshnessBannerProps) {
  const allStale = staleCount >= totalCount && totalCount > 0;
  const headline = allStale
    ? "These prices were last confirmed a few days ago"
    : "A few of these prices were confirmed a few days ago";

  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50/80 px-3.5 py-2.5 text-stone-600"
      role="status"
    >
      <Clock size={15} className="mt-0.5 shrink-0 text-stone-400" aria-hidden />
      <p className="text-xs leading-relaxed">
        <span className="font-medium text-stone-700">{headline}</span> — not re-verified
        today, so it&rsquo;s worth a quick check at the retailer before you buy. We only show
        prices we&rsquo;ve actually confirmed, never guesses.
      </p>
    </div>
  );
}
