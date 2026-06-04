"use client";

import type { ConfidenceBand } from "@/lib/commerce-intelligence/explain";
import { Shield } from "lucide-react";

function chipStyles(band: ConfidenceBand): string {
  if (band === "high") return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  if (band === "medium") return "bg-amber-100 text-amber-900 ring-amber-200";
  return "bg-stone-100 text-stone-600 ring-stone-200";
}

export function OfferConfidenceChip({
  confidence,
  band,
  compact = false,
}: {
  confidence: number;
  band: ConfidenceBand;
  compact?: boolean;
}) {
  const pct = Math.round(confidence * 100);
  if (pct < 45) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ring-1 ${chipStyles(band)} ${
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
      }`}
      title={`Offer confidence ${pct}%`}
    >
      <Shield size={compact ? 10 : 11} aria-hidden />
      {pct}%
    </span>
  );
}
