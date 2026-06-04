"use client";

import { BETA_COHORT_LABELS } from "@/lib/commerce-intelligence/beta/cohort";
import { getBetaCohort } from "@/lib/commerce-intelligence/beta/cohort-client";
import { publicLaunchFlags } from "@/lib/commerce-intelligence/ops/public-flags";
import { reopenIntelligenceOnboarding } from "@/components/onboarding/IntelligenceBetaOnboarding";
import { useEffect, useState } from "react";

export function BetaModeBanner() {
  const [cohortLabel, setCohortLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!publicLaunchFlags.betaMode) return;
    const c = getBetaCohort();
    setCohortLabel(BETA_COHORT_LABELS[c]);
  }, []);

  if (!publicLaunchFlags.betaMode) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-b border-sage-200 bg-sage-50 px-3 py-1.5 text-center text-xs text-sage-900">
      <span>
        You’re using the <strong>Homivion beta</strong> — recommendations are evidence-based and
        still improving.
        {cohortLabel && cohortLabel !== BETA_COHORT_LABELS.general ?
          <span className="ml-1 text-sage-700">({cohortLabel})</span>
        : null}
      </span>
      <button
        type="button"
        onClick={() => reopenIntelligenceOnboarding()}
        className="font-semibold text-sage-800 underline"
      >
        How it works
      </button>
    </div>
  );
}
