"use client";

import { Info } from "lucide-react";

interface EquivalenceExplainerProps {
  reasons?: string[];
  matchTier?: string;
  className?: string;
}

export function EquivalenceExplainer({
  reasons,
  matchTier,
  className = "",
}: EquivalenceExplainerProps) {
  if (!reasons?.length) return null;

  return (
    <details
      className={`rounded-xl border border-stone-200/80 bg-white/90 ${className}`}
      open={matchTier === "exact" || matchTier === "near"}
    >
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-medium text-stone-700">
        <Info size={16} className="shrink-0 text-sage-600" aria-hidden />
        Why we think these are equivalent
      </summary>
      <ul className="border-t border-stone-100 px-3 py-2 text-xs leading-relaxed text-stone-600">
        {reasons.map((r) => (
          <li key={r} className="list-inside list-disc py-0.5">
            {r}
          </li>
        ))}
      </ul>
    </details>
  );
}
