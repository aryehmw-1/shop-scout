"use client";

import { Info, Search } from "lucide-react";
import type { RetrievalMeta } from "@/lib/types";
import { offerQualityLabel, tierDisplayLabel } from "@/lib/search/retrieval-meta";

interface RetrievalNormalizationBannerProps {
  query?: string;
  retrievalMeta?: RetrievalMeta;
  closestMatchFallback?: boolean;
  noExactMatchFound?: boolean;
}

export function RetrievalNormalizationBanner({
  query,
  retrievalMeta,
  closestMatchFallback,
  noExactMatchFound,
}: RetrievalNormalizationBannerProps) {
  const message =
    retrievalMeta?.normalizationMessage ??
    (closestMatchFallback && query ?
      `Showing closest matches for “${query}”`
    : null);

  if (!message && !retrievalMeta?.tier) return null;

  const quality = retrievalMeta?.offerQuality ??
    (closestMatchFallback ? "closest_match" : noExactMatchFound ? "closest_match" : "estimated");

  return (
    <div
      className="rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-sm text-sky-950"
      role="status"
    >
      <div className="flex items-start gap-2">
        <Search size={18} className="mt-0.5 shrink-0 text-sky-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{message ?? "Search results normalized"}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-white px-2 py-0.5 font-medium ring-1 ring-sky-200">
              {offerQualityLabel(quality)}
            </span>
            {retrievalMeta?.tier && (
              <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-sky-200">
                {tierDisplayLabel(retrievalMeta.tier)}
              </span>
            )}
          </div>
          {retrievalMeta?.matchReason && (
            <p className="mt-2 flex items-start gap-1 text-xs text-sky-900/85">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Why matched:{" "}
                <code className="rounded bg-white/80 px-1 py-0.5 text-[10px]">
                  {retrievalMeta.matchReason}
                </code>
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
