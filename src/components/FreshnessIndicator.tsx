"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductOffer } from "@/lib/types";
import { classifyOfferFreshness } from "@/lib/pricing/quote-freshness-policy";
import { Clock, AlertTriangle } from "lucide-react";

const TIER_STYLES = {
  fresh: "bg-emerald-50 text-emerald-800 border-emerald-200",
  aging: "bg-amber-50 text-amber-900 border-amber-200",
  stale_visible: "bg-orange-50 text-orange-900 border-orange-200",
  expired: "bg-stone-100 text-stone-600 border-stone-200",
} as const;

const TIER_EXPLAINER: Record<string, string> = {
  fresh: "We confirmed this price very recently — it should match the retailer right now.",
  aging: "We confirmed this price a little while ago. It's likely still accurate, but worth a glance at the retailer.",
  stale_visible:
    "This price was last confirmed a few days ago and hasn't been re-checked today. It's usually still close, but double-check it on the retailer before you buy.",
  expired:
    "We haven't been able to re-confirm this price recently, so treat it as a rough guide and verify it on the retailer before buying.",
};

interface FreshnessIndicatorProps {
  offer: ProductOffer;
  compact?: boolean;
  className?: string;
  /** Render as a tappable badge that shows a small popover explaining the tier. */
  interactive?: boolean;
}

export function FreshnessIndicator({
  offer,
  compact,
  className = "",
  interactive,
}: FreshnessIndicatorProps) {
  const meta = classifyOfferFreshness(offer);
  const tier = offer.freshnessTier ?? meta.tier;
  const label = offer.freshnessLabel ?? meta.shortLabel;
  const styles = TIER_STYLES[tier] ?? TIER_STYLES.stale_visible;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  if (tier === "fresh" && compact) return null;

  const Icon = tier === "stale_visible" || tier === "expired" ? AlertTriangle : Clock;
  const badgeClass = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles} ${className}`;

  if (!interactive) {
    return (
      <span className={badgeClass} title={meta.displayLabel}>
        <Icon size={10} aria-hidden />
        {compact ? label : meta.displayLabel}
      </span>
    );
  }

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={`What does "${label}" mean?`}
        aria-expanded={open}
        onClick={(e) => {
          // Inside a tappable card/link — don't navigate, just toggle the note.
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={badgeClass}
      >
        <Icon size={10} aria-hidden />
        {compact ? label : meta.displayLabel}
      </button>
      {open && (
        <span
          role="status"
          className="absolute left-0 top-full z-40 mt-1.5 w-56 rounded-xl border border-stone-200 bg-white px-3 py-2 text-left text-[11px] font-normal leading-snug text-stone-600 shadow-lg"
        >
          <span className="mb-0.5 block font-semibold text-stone-800">{meta.displayLabel}</span>
          {TIER_EXPLAINER[tier] ?? TIER_EXPLAINER.stale_visible}
        </span>
      )}
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
