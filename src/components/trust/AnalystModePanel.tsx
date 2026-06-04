"use client";

import type { RecommendationExplanation } from "@/lib/commerce-intelligence/explain";
import { formatPrice } from "@/lib/utils/format";
import { Activity, ChevronDown, GitBranch, ListChecks, Scale, Sparkles, Store } from "lucide-react";
import { useState, type ReactNode } from "react";

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-stone-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-stone-800">
          {icon}
          {title}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && <div className="border-t border-stone-100 px-3 pb-3 pt-2">{children}</div>}
    </section>
  );
}

/** Progressive analyst drill-down — sections collapsed by default on mobile. */
export function AnalystModePanel({
  insight,
  className = "",
}: {
  insight: RecommendationExplanation;
  className?: string;
}) {
  const d = insight.decision;
  const adaptive = insight.adaptive;

  if (!d && !adaptive) {
    return (
      <p className={`text-sm text-stone-500 ${className}`}>
        No purchase decision available for this product yet.
      </p>
    );
  }

  return (
    <div
      className={`space-y-3 rounded-2xl border border-stone-200 bg-stone-50/80 p-3 text-sm sm:space-y-4 sm:p-4 ${className}`}
    >
      <p className="flex items-center gap-2 font-semibold text-stone-800">
        <Sparkles size={16} className="text-sage-600" aria-hidden />
        Detailed breakdown
      </p>

      {insight.investigationSummary && (
        <p className="rounded-lg border border-sage-200 bg-sage-50/80 px-3 py-2 text-stone-700">
          {insight.investigationSummary}
        </p>
      )}

      {adaptive?.stabilityForecast && (
        <CollapsibleSection title="How long this holds" icon={<Activity size={14} aria-hidden />}>
          <p className="text-stone-600">{adaptive.stabilityForecast.summary}</p>
        </CollapsibleSection>
      )}

      {d && (
        <CollapsibleSection
          title="Why this store"
          icon={<Scale size={14} aria-hidden />}
          defaultOpen
        >
          <p className="text-stone-600">{d.winnerRationale}</p>
          <ul className="mt-2 list-inside list-disc text-stone-600">
            {d.whyThisWins.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {d && d.candidates.length > 0 && (
        <CollapsibleSection title="Other options" icon={<Scale size={14} aria-hidden />}>
          <ul className="space-y-2">
            {d.candidates.map((c) => (
              <li key={c.offerId} className="text-stone-600">
                <span className="font-semibold text-stone-900">
                  #{c.rank} {c.retailerName}
                </span>{" "}
                · {formatPrice(c.price)}
                <p className="text-xs text-stone-500">{c.vsWinnerSummary}</p>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {d && d.counterfactuals.length > 0 && (
        <CollapsibleSection
          title="What would change this"
          icon={<GitBranch size={14} aria-hidden />}
        >
          <ul className="space-y-2 text-stone-600">
            {d.counterfactuals.map((cf) => (
              <li key={cf.id}>
                <span className="font-medium text-stone-800">{cf.label}:</span> {cf.description}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {adaptive && adaptive.retailerIntelligence.length > 0 && (
        <CollapsibleSection title="Store reliability" icon={<Store size={14} aria-hidden />}>
          <ul className="space-y-2 text-stone-600">
            {adaptive.retailerIntelligence.map((r) => (
              <li key={r.retailer}>
                <span className="font-semibold">{r.retailer}</span> — {r.summary}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {d && d.reasoningTrace.length > 0 && (
        <CollapsibleSection
          title="Full reasoning trace"
          icon={<ListChecks size={14} aria-hidden />}
        >
          <ol className="max-h-48 space-y-1 overflow-y-auto text-xs text-stone-600">
            {d.reasoningTrace.map((step, i) => (
              <li key={`${step.kind}-${i}`}>
                <span className="font-mono text-stone-400">{step.kind}</span> — {step.message}
              </li>
            ))}
          </ol>
        </CollapsibleSection>
      )}

      {d?.stability.note && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {d.stability.note}
        </p>
      )}
    </div>
  );
}
