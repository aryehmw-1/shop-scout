"use client";

import type { RecommendationExplanation } from "@/lib/commerce-intelligence/explain";
import { trackIntelligenceEvent } from "@/lib/commerce-intelligence/analytics/track-client";
import { BadgeCheck, ChevronDown, Info, ListChecks } from "lucide-react";
import { useEffect } from "react";
import { RecommendationFeedback } from "./RecommendationFeedback";
import { getIntelligenceSessionId } from "@/lib/commerce-intelligence/analytics/session-id";
import { formatUncertaintyLine } from "@/lib/commerce-intelligence/explain/uncertainty-copy";
import { getExperimentVariant, isExperimentEnabled } from "@/lib/commerce-intelligence/experiments/variants";
import { formatPrice } from "@/lib/utils/format";

/** Calm, mobile-first trust card — details on demand only. */
export function TrustSummaryCard({
  insight,
  className = "",
}: {
  insight: RecommendationExplanation;
  className?: string;
}) {
  const framing =
    isExperimentEnabled() ?
      getExperimentVariant("trust_framing", insight.canonicalId)
    : "control";

  const sortedCandidates = insight.decision?.candidates
    ? [...insight.decision.candidates].sort((a, b) => a.price - b.price)
    : [];
  const cheapest = sortedCandidates[0];
  const primaryLine =
    cheapest ?
      `Best price: ${cheapest.retailerName} · ${formatPrice(cheapest.price)}`
    : insight.decision ?
      framing === "a" ?
        `${insight.decision.winnerRetailerName} · ${formatPrice(insight.decision.winnerPrice)}`
      : `Best price: ${insight.decision.winnerRetailerName} · ${formatPrice(insight.decision.winnerPrice)}`
    : insight.trustSummary;

  const uncertaintyFirst =
    isExperimentEnabled() &&
    getExperimentVariant("trust_framing", insight.canonicalId) === "b" &&
    insight.uncertainty.length > 0;

  useEffect(() => {
    trackIntelligenceEvent("recommendation_shown", { canonicalId: insight.canonicalId });
  }, [insight.canonicalId]);

  return (
    <div className={className}>
      <div
        className="rounded-2xl border border-sage-200/80 bg-white px-4 py-3.5 shadow-sm sm:px-5"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 shrink-0 text-sage-600" size={22} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-snug text-stone-900">
              {primaryLine}
            </p>
            {uncertaintyFirst && insight.uncertainty[0] && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-amber-900">
                <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  {formatUncertaintyLine(insight.uncertainty[0].message, insight.canonicalId)}
                </span>
              </p>
            )}
            <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
              We compare the available store prices and show the lowest price first.
            </p>
            {insight.personalizationNote && (
              <p className="mt-2 text-xs text-sage-800">{insight.personalizationNote}</p>
            )}
            {!uncertaintyFirst && insight.uncertainty.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-900">
                <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  {formatUncertaintyLine(insight.uncertainty[0]!.message, insight.canonicalId)}
                </span>
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          <details
            className="group rounded-xl border border-sage-200 bg-white"
            onToggle={(event) => {
              trackIntelligenceEvent(
                event.currentTarget.open ? "trust_details_open" : "trust_details_close",
                { canonicalId: insight.canonicalId },
              );
            }}
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-sage-800 group-open:bg-sage-50">
              Why this pick
              <ChevronDown
                size={16}
                className="shrink-0 transition group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="border-t border-sage-100 bg-sage-50/80 px-4 py-3 text-sm leading-relaxed text-sage-950">
              <p>
                {cheapest ?
                  `${cheapest.retailerName} is first because it has the lowest listed price at ${formatPrice(cheapest.price)}.`
                : insight.decision ?
                  `${insight.decision.winnerRetailerName} is first because it has the lowest listed price we found at ${formatPrice(insight.decision.winnerPrice)}.`
                : "This pick is based on the store prices we could compare for this product."}
              </p>
              {sortedCandidates[1] && (
                <p className="mt-2">
                  The next closest store is {sortedCandidates[1].retailerName} at{" "}
                  {formatPrice(sortedCandidates[1].price)}.
                </p>
              )}
              {insight.uncertainty[0] && (
                <p className="mt-2 text-amber-900">
                  {formatUncertaintyLine(insight.uncertainty[0].message, insight.canonicalId)}
                </p>
              )}
            </div>
          </details>
          {insight.decision && (
            <details
              className="group overflow-hidden rounded-xl border border-stone-200 bg-white"
              onToggle={(event) => {
                if (event.currentTarget.open) {
                  trackIntelligenceEvent("trust_details_open", {
                    canonicalId: insight.canonicalId,
                  });
                }
              }}
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-stone-700 group-open:bg-stone-50">
                <ListChecks size={16} aria-hidden />
                More detail
              </summary>
              <div className="border-t border-stone-100 text-sm">
                {(sortedCandidates.length ? sortedCandidates : insight.decision?.candidates ?? []).map(
                  (candidate, index) => (
                    <div
                      key={candidate.offerId}
                      className="grid gap-2 border-t border-stone-100 px-4 py-3 first:border-t-0 sm:grid-cols-[auto_1fr_auto]"
                    >
                      <span className="font-semibold text-stone-500">#{index + 1}</span>
                      <span className="font-semibold text-stone-900">
                        {candidate.retailerName}
                      </span>
                      <span className="font-bold text-stone-950">
                        {formatPrice(candidate.price)}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </details>
          )}
        </div>
        <RecommendationFeedback
          canonicalId={insight.canonicalId}
          sessionId={getIntelligenceSessionId()}
        />
      </div>
    </div>
  );
}
