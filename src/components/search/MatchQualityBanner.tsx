"use client";

import { AlertTriangle, Info } from "lucide-react";

interface MatchQualityBannerProps {
  noExactMatchFound?: boolean;
  query?: string;
}

export function MatchQualityBanner({ noExactMatchFound, query }: MatchQualityBannerProps) {
  if (!noExactMatchFound) return null;

  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950"
      role="status"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
        <div>
          <p className="font-semibold">No exact match found</p>
          <p className="mt-1 text-amber-900/90">
            {query
              ? `We couldn't verify an exact listing for “${query}”.`
              : "We couldn't verify an exact listing for this search."}{" "}
            Results below are closest available matches — check pack size and flavor before buying.
          </p>
          <p className="mt-2 flex items-center gap-1 text-xs text-amber-800">
            <Info size={14} aria-hidden />
            Variety packs and multipacks are never shown as exact matches.
          </p>
        </div>
      </div>
    </div>
  );
}
