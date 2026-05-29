"use client";

import type { SearchPipelineDebugSummary } from "@/lib/types";

interface SearchPipelineDebugPanelProps {
  debug: SearchPipelineDebugSummary;
}

export function SearchPipelineDebugPanel({ debug }: SearchPipelineDebugPanelProps) {
  return (
    <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-left text-sm">
      <summary className="cursor-pointer font-semibold text-amber-900">
        Search pipeline debug · {debug.resolvedCatalogId}
      </summary>
      <p className="mt-2 text-xs text-amber-800">{debug.semanticNote}</p>
      <p className="mt-1 text-xs text-amber-800">
        Resolved: <strong>{debug.resolvedTitle}</strong> ({debug.matchReason})
        {debug.keywordFallbackUsed ? " · keyword fallback" : ""}
      </p>
      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="text-left text-amber-700">
            <th className="py-1 pr-2">Stage</th>
            <th className="py-1 pr-2">Count</th>
            <th className="py-1">Detail</th>
          </tr>
        </thead>
        <tbody>
          {debug.stages.map((s) => (
            <tr key={s.stage} className="border-t border-amber-100">
              <td className="py-1 pr-2 font-mono">{s.stage.replace(/^\d+_/, "")}</td>
              <td className="py-1 pr-2 font-bold">{s.count}</td>
              <td className="py-1 text-amber-900">
                {s.detail ?? s.samples?.slice(0, 3).join(", ") ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {debug.filterReasons.length > 0 && (
        <div className="mt-3">
          <p className="font-medium text-amber-900">Filtered offers</p>
          <ul className="mt-1 space-y-1 text-xs text-amber-900">
            {debug.filterReasons.slice(0, 10).map((f, i) => (
              <li key={`${f.retailer}-${i}`}>
                {f.retailer} ${f.price.toFixed(2)} ({f.priceSource}, conf=
                {f.matchConfidence?.toFixed(2) ?? "?"}) → {f.reasons.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}

export function searchDebugEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_SEARCH_DEBUG === "1" ||
    process.env.NEXT_PUBLIC_SEARCH_DEBUG === "true" ||
    process.env.NEXT_PUBLIC_SEARCH_DEBUG === "on";
}
