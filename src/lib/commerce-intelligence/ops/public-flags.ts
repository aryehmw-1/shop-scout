/** Client-safe launch flags (NEXT_PUBLIC_* only). */

import { normalizeBetaCohort } from "../beta/cohort";

export const publicLaunchFlags = {
  betaMode: process.env.NEXT_PUBLIC_BETA_MODE === "1",
  betaCohort: normalizeBetaCohort(process.env.NEXT_PUBLIC_BETA_COHORT),
  maintenanceBanner: process.env.NEXT_PUBLIC_MAINTENANCE_BANNER?.trim() || null,
  intelligenceOnboarding: process.env.NEXT_PUBLIC_SKIP_INTEL_ONBOARDING !== "1",
} as const;
