"use client";

import type { ConversationDebugSnapshot } from "@/lib/types";

export function ConversationDebugPanel({ debug }: { debug: ConversationDebugSnapshot }) {
  return (
    <details className="mt-4 rounded-xl border border-violet-200 bg-violet-50/80 p-4 text-left text-sm">
      <summary className="cursor-pointer font-semibold text-violet-900">
        Conversation state · {debug.action}
        {debug.merged ? " (merged)" : ""}
      </summary>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-violet-600">Prior query</dt>
          <dd className="font-mono">{debug.priorQuery ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-violet-600">Next query</dt>
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
