"use client";

import type { ConversationDebugSnapshot } from "@/lib/types";

export function ConversationDebugPanel({ debug }: { debug: ConversationDebugSnapshot }) {
  const transition = debug.intentTransition;
  const decisionLabel = transition
    ? transition.shouldMerge
      ? "merge (refine)"
      : "replace (fresh search)"
    : debug.merged
      ? "merge (refine)"
      : "replace (fresh search)";

  return (
    <details className="mt-4 rounded-xl border border-violet-200 bg-violet-50/80 p-4 text-left text-sm">
      <summary className="cursor-pointer font-semibold text-violet-900">
        Conversation state · {debug.action}
        {debug.merged ? " (merged)" : " (replaced)"}
      </summary>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-violet-600">Prior active intent</dt>
          <dd className="font-mono">{debug.priorQuery ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-violet-600">Current query</dt>
          <dd className="font-mono">{debug.message}</dd>
        </div>
        <div>
          <dt className="text-violet-600">Merge vs replace</dt>
          <dd className="font-semibold">{decisionLabel}</dd>
        </div>
        {transition ? (
          <>
            <div>
              <dt className="text-violet-600">Classification</dt>
              <dd className="font-mono">{transition.action}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-violet-600">Reason</dt>
              <dd className="font-mono">{transition.reason}</dd>
            </div>
            <div>
              <dt className="text-violet-600">Confidence</dt>
              <dd>{Math.round(transition.confidence * 100)}%</dd>
            </div>
            <div>
              <dt className="text-violet-600">Token overlap</dt>
              <dd>{transition.tokenOverlap.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-violet-600">Prior category family</dt>
              <dd>{transition.priorCategoryFamily ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-violet-600">Next category family</dt>
              <dd>{transition.nextCategoryFamily ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-violet-600">Prior taxonomy</dt>
              <dd className="font-mono">{transition.priorTaxonomy.join(", ") || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-violet-600">Next taxonomy</dt>
              <dd className="font-mono">{transition.nextTaxonomy.join(", ") || "—"}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt className="text-violet-600">Next query (stored intent)</dt>
          <dd className="font-mono">{debug.nextQuery}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-violet-600">Full search query</dt>
          <dd className="font-mono font-semibold">{debug.fullQuery}</dd>
        </div>
        <div>
          <dt className="text-violet-600">Gender</dt>
          <dd>{debug.attributes.gender ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-violet-600">Size</dt>
          <dd>{debug.attributes.size ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-violet-600">Brand</dt>
          <dd>{debug.attributes.brand ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-violet-600">Max price</dt>
          <dd>{debug.attributes.maxPrice ? `$${debug.attributes.maxPrice}` : "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-violet-600">Colors</dt>
          <dd>{debug.attributes.colors?.join(", ") ?? "—"}</dd>
        </div>
      </dl>
    </details>
  );
}
