"use client";

import type { ConfidenceBand } from "@/lib/commerce-intelligence/explain";

function bandColor(band: ConfidenceBand): string {
  if (band === "high") return "bg-emerald-500";
  if (band === "medium") return "bg-amber-500";
  return "bg-stone-400";
}

function bandText(band: ConfidenceBand): string {
  if (band === "high") return "text-emerald-800";
  if (band === "medium") return "text-amber-900";
  return "text-stone-600";
}

export function ConfidenceMeter({
  value,
  band,
  label,
  compact = false,
  className = "",
}: {
  value: number;
  band: ConfidenceBand;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);

  return (
    <div className={className}>
      <div className={`flex items-center justify-between gap-2 ${compact ? "text-xs" : "text-sm"}`}>
        {label && <span className="font-medium text-stone-700">{label}</span>}
        <span className={`font-semibold tabular-nums ${bandText(band)}`}>{pct}%</span>
      </div>
      <div
        className={`mt-1 overflow-hidden rounded-full bg-stone-200 ${compact ? "h-1.5" : "h-2"}`}
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Confidence"}
      >
        <div
          className={`h-full rounded-full transition-all ${bandColor(band)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
