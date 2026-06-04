"use client";

import type { RecommendationExplanation } from "@/lib/commerce-intelligence/explain";
import { formatPrice } from "@/lib/utils/format";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  FileCheck2,
  Scale,
  Shield,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

export function RecommendationInsightPanel({
  insight,
  defaultOpen = true,
  compact = false,
  className = "",
  detailsOnly = false,
}: {
  insight: RecommendationExplanation;
  defaultOpen?: boolean;
  compact?: boolean;
  className?: string;
  /** Skip summary header — used inside TrustSummaryCard */
  detailsOnly?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={`rounded-2xl border border-sage-200/90 bg-gradient-to-br from-sage-50/90 to-white shadow-sm ${className}`}
      aria-label="Recommendation intelligence"
    >
      {!detailsOnly && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left sm:px-5 sm:py-4"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sage-800">
              <Sparkles size={14} aria-hidden />
              Evidence-backed recommendation
            </p>
            <p className={`mt-1 font-semibold text-stone-900 ${compact ? "text-sm" : "text-base"}`}>
              {insight.headline}
            </p>
            <p className="mt-1 text-sm text-stone-600">{insight.trustSummary}</p>
          </div>
          <ChevronDown
            size={18}
            className={`mt-1 shrink-0 text-stone-400 transition ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      )}

      {open && (
        <div
          className={`space-y-4 px-4 py-4 sm:px-5 ${detailsOnly ? "" : "border-t border-sage-100"}`}
        >
          <p className="text-sm text-stone-600">{insight.whyRecommended.replace(/\*\*/g, "")}</p>

          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-sm font-semibold text-stone-800">Product match</p>
            <p className="mt-1 text-sm text-stone-600">
              We matched this product across {insight.retailerAgreement.retailerCount}{" "}
              store{insight.retailerAgreement.retailerCount === 1 ? "" : "s"} before
              comparing prices.
            </p>
          </div>

          {insight.consensus && insight.consensus.offerCount >= 2 && (
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                <Scale size={16} className="text-sage-600" aria-hidden />
                Consensus pricing
              </p>
              <p className="mt-2 text-sm text-stone-600">
                {formatPrice(insight.consensus.minPrice)} – {formatPrice(insight.consensus.maxPrice)}{" "}
                across {insight.consensus.offerCount} stores · median{" "}
                {formatPrice(insight.consensus.medianPrice)}
              </p>
              {insight.consensus.savingsVsHighest > 0.5 && (
                <p className="mt-1 text-sm font-medium text-emerald-800">
                  Save up to {formatPrice(insight.consensus.savingsVsHighest)} vs highest listed price
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-medium text-stone-700 ring-1 ring-stone-200">
              <BadgeCheck size={12} aria-hidden />
              {insight.retailerAgreement.agreementLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-medium text-stone-700 ring-1 ring-stone-200">
              <FileCheck2 size={12} aria-hidden />
              {insight.evidence.count} evidence record{insight.evidence.count === 1 ? "" : "s"}
            </span>
            {insight.retailerAgreement.sourceTypes.map((s) => (
              <span
                key={s}
                className="rounded-full bg-sage-100 px-2.5 py-1 font-medium text-sage-900"
              >
                {s.replace(/_/g, " ")}
              </span>
            ))}
          </div>

          {(insight.bestValue || insight.safestPurchase) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {insight.bestValue && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-sm">
                  <p className="font-semibold text-emerald-900">Best value</p>
                  <p className="mt-1 text-emerald-800">
                    {insight.bestValue.retailer} · {formatPrice(insight.bestValue.price)}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">{insight.bestValue.reason}</p>
                </div>
              )}
              {insight.safestPurchase && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-sm">
                  <p className="flex items-center gap-1 font-semibold text-sky-900">
                    <Shield size={14} aria-hidden />
                    Safest purchase
                  </p>
                  <p className="mt-1 text-sky-800">{insight.safestPurchase.retailer}</p>
                  <p className="mt-1 text-xs text-sky-700">{insight.safestPurchase.reason}</p>
                </div>
              )}
            </div>
          )}

          {insight.worthWaiting && (
            <p className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
              <span className="font-semibold">
                {insight.worthWaiting.suggest ? "Worth waiting?" : "Buy now?"}
              </span>{" "}
              {insight.worthWaiting.reason}
            </p>
          )}

          {insight.fakeDiscountWarnings.length > 0 && (
            <ul className="space-y-2">
              {insight.fakeDiscountWarnings.map((w) => (
                <li
                  key={`${w.retailer}-${w.message}`}
                  className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                >
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    <strong>{w.retailer}:</strong> {w.message}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {insight.uncertainty.length > 0 && (
            <ul className="space-y-2">
              {insight.uncertainty.map((u) => (
                <li
                  key={u.message}
                  className={`flex gap-2 rounded-xl px-3 py-2 text-sm ${
                    u.level === "warning" ?
                      "border border-amber-200 bg-amber-50/90 text-amber-900"
                    : "border border-stone-200 bg-stone-50 text-stone-700"
                  }`}
                >
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  {u.message}
                </li>
              ))}
            </ul>
          )}

          {insight.identity.reasons.length > 0 && (
            <ul className="list-inside list-disc text-xs text-stone-500">
              {insight.identity.reasons.slice(0, 4).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
