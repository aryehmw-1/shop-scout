"use client";

import { trackIntelligenceEvent } from "@/lib/commerce-intelligence/analytics/track-client";
import { getExperimentVariant, isExperimentEnabled } from "@/lib/commerce-intelligence/experiments/variants";
import { publicLaunchFlags } from "@/lib/commerce-intelligence/ops/public-flags";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "ss-intelligence-onboarding-v1";

const STEPS = [
  {
    title: "What Homivion does",
    body: "We compare the same product across stores and suggest a best option from compare pricing — not ads.",
  },
  {
    title: "Your recommendation",
    body: "You’ll see a clear best pick. If we’re unsure, we say that first.",
  },
  {
    title: "Why this pick",
    body: "Short explanation: which stores agree and what we checked. Optional — only if you want it.",
  },
  {
    title: "More detail",
    body: "Deeper view for power users. Skip it unless you want every store considered.",
  },
  {
    title: "Privacy",
    body: "Anonymous feedback only. No selling your data.",
  },
];

export function IntelligenceBetaOnboarding({
  onDismiss,
}: {
  onDismiss?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!publicLaunchFlags.intelligenceOnboarding) return;
    if (localStorage.getItem(STORAGE_KEY) === "1") return;
    const id = window.requestAnimationFrame(() => setOpen(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  if (!open) return null;

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  function close(completed: boolean) {
    localStorage.setItem(STORAGE_KEY, "1");
    trackIntelligenceEvent(
      completed ? "onboarding_completed" : "onboarding_dismissed_early",
    );
    setOpen(false);
    onDismiss?.();
  }

  const copyVariant =
    isExperimentEnabled() ? getExperimentVariant("onboarding_copy", "global") : "control";
  const stepBody =
    step === 0 && copyVariant === "a" ?
      "We compare prices for the same product across stores — using persisted pricing, not sponsored rankings."
    : current.body;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-stone-900/40 p-4 sm:items-center"
      role="dialog"
      aria-labelledby="intel-onboard-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-sage-700">
            {publicLaunchFlags.betaMode ? "Beta" : "How it works"}
          </p>
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <h2 id="intel-onboard-title" className="mt-2 text-lg font-semibold text-stone-900">
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">{stepBody}</p>
        <div className="mt-4 flex gap-1">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i === step ? "bg-sage-600" : "bg-stone-200"}`}
            />
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="min-h-11 flex-1 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? close(true) : setStep((s) => s + 1))}
            className="min-h-11 flex-1 rounded-xl bg-sage-700 text-sm font-semibold text-white hover:bg-sage-800"
          >
            {isLast ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function reopenIntelligenceOnboarding(): void {
  localStorage.removeItem(STORAGE_KEY);
  trackIntelligenceEvent("onboarding_reopened");
  window.dispatchEvent(new CustomEvent("ss-reopen-intel-onboarding"));
}
