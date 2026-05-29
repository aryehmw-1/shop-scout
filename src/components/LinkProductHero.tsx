"use client";

import type { ReferenceProduct } from "@/lib/types";
import { formatPrice } from "@/lib/utils/format";
import { getRetailerMeta } from "@/lib/retailers/meta";
import { ExternalLink, Link2, ShieldCheck, AlertTriangle } from "lucide-react";
import { ProductImage } from "./ProductImage";
import { EquivalenceExplainer } from "./EquivalenceExplainer";

interface LinkProductHeroProps {
  reference: ReferenceProduct;
}

function confidenceLabel(tier?: string, confidence?: number): string {
  if (tier === "exact" || (confidence != null && confidence >= 0.9)) return "Exact match";
  if (tier === "near" || (confidence != null && confidence >= 0.75)) return "Strong match";
  if (tier === "family") return "Similar product family";
  return "Unverified match";
}

export function LinkProductHero({ reference }: LinkProductHeroProps) {
  const meta = reference.sourceRetailer ? getRetailerMeta(reference.sourceRetailer) : null;
  const conf = confidenceLabel(reference.matchTier, reference.matchConfidence);
  const isLow =
    reference.matchConfidence != null && reference.matchConfidence < 0.6;

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-sage-300 bg-gradient-to-br from-white via-sage-50/50 to-white p-4 sm:p-5">
      <div className="flex gap-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-white sm:h-28 sm:w-28">
          {reference.imageUrl ?
            <ProductImage
              src={reference.imageUrl}
              alt={reference.title}
              className="h-full w-full object-cover"
            />
          : <div className="flex h-full items-center justify-center text-stone-300">
              <Link2 size={32} />
            </div>
          }
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-sage-700">
            From your link
          </p>
          <h3 className="font-homy mt-0.5 text-lg font-bold leading-snug text-stone-900 sm:text-xl">
            {reference.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {meta && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ backgroundColor: meta.color }}
              >
                {meta.shortName}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isLow ?
                  "bg-amber-100 text-amber-900"
                : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {isLow ?
                <AlertTriangle size={12} aria-hidden />
              : <ShieldCheck size={12} aria-hidden />}
              {conf}
              {reference.matchConfidence != null &&
                ` · ${Math.round(reference.matchConfidence * 100)}%`}
            </span>
            <span className="text-sm font-semibold text-stone-800">
              {reference.priceVerified ? "Verified" : "Est."}{" "}
              {formatPrice(reference.referencePrice)}
            </span>
          </div>
          <a
            href={reference.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sage-700 hover:underline"
          >
            View original
            <ExternalLink size={12} aria-hidden />
          </a>
        </div>
      </div>

      {reference.variantWarning && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Variant caution: {reference.variantWarning}. Best Deal ranking is suppressed until
          verified.
        </p>
      )}

      <EquivalenceExplainer
        reasons={reference.equivalenceReasons}
        matchTier={reference.matchTier}
        className="mt-3"
      />
    </section>
  );
}
