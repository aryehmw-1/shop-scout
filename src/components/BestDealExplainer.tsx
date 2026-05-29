"use client";

import type { ProductOffer } from "@/lib/types";
import { buildDealExplanation } from "@/lib/shopping/deal-explanation";
import { ChevronDown, Info } from "lucide-react";
import { useState } from "react";

interface BestDealExplainerProps {
  offer: ProductOffer;
  className?: string;
  defaultOpen?: boolean;
}

export function BestDealExplainer({
  offer,
  className = "",
  defaultOpen = true,
}: BestDealExplainerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const explanation = offer.dealExplanation ?? buildDealExplanation(offer);

  if (!explanation.bullets.length) return null;

  return (
    <div className={`rounded-xl border border-sage-200/90 bg-white/80 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-sage-900">
          <Info size={16} className="shrink-0 text-sage-600" />
          {explanation.headline}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul className="space-y-1.5 border-t border-sage-100 px-3 py-2.5 text-sm text-stone-700">
          {explanation.bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sage-500" />
              <span>{b}</span>
            </li>
          ))}
          {explanation.dealScore != null && (
            <li className="pt-1 text-xs text-stone-500">
              Deal quality score: {Math.round(explanation.dealScore * 100)}/100
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
