"use client";

import { ExternalLink, Sparkles, Info } from "lucide-react";
import type { SimilarProduct } from "@/lib/types";
import { ProductImage } from "@/components/ProductImage";

interface Props {
  similar: SimilarProduct[];
  /** How many exact-match offers were shown (to honor the 7-card cap + copy). */
  exactCount: number;
}

/**
 * Clearly-labelled SIMILAR alternatives (Option 3). Different products — never
 * part of price comparison, never "Best". When there is exactly one verified
 * seller we say so honestly instead of faking a comparison. The grid is capped so
 * exact + similar never exceeds 7 cards.
 */
export function SimilarAlternatives({ similar, exactCount }: Props) {
  if (!similar.length) return null;
  const cap = Math.max(0, 7 - exactCount);
  const items = similar.slice(0, cap);
  if (!items.length) return null;

  return (
    <section className="mt-3">
      {exactCount === 1 && (
        <p className="mb-2 flex items-start gap-1.5 px-1 text-[11px] leading-snug text-stone-400">
          <Info size={13} className="mt-px shrink-0" aria-hidden />
          <span>Only one verified seller so far — we&apos;ll add more as we check other stores.</span>
        </p>
      )}
      <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold text-stone-500">
        <Sparkles size={13} className="text-sage-500" aria-hidden />
        Similar alternatives
      </p>
      <ul className="space-y-2">
        {items.map((s) => {
          const inner = (
            <>
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-50 ring-1 ring-stone-100">
                <ProductImage src={s.imageUrl} alt={s.title} className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600">
                    Similar
                  </span>
                  <span className="text-xs font-semibold text-stone-900">{s.retailerName}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-stone-500">{s.title}</p>
              </div>
              <span className="shrink-0 text-sm font-bold text-stone-900">
                ${s.price.toFixed(2)}
              </span>
              {s.affiliateUrl && (
                <ExternalLink size={14} className="shrink-0 text-stone-300" aria-hidden />
              )}
            </>
          );
          const className =
            "flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-2 transition hover:border-stone-300";
          // Affiliate-safe: hide the outbound link entirely when no tracked URL.
          return s.affiliateUrl ? (
            <li key={s.catalogId}>
              <a
                href={s.affiliateUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className={className}
                aria-label={`View ${s.title} at ${s.retailerName}`}
              >
                {inner}
              </a>
            </li>
          ) : (
            <li key={s.catalogId} className={className}>
              {inner}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
