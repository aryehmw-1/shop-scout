/** Controlled beta cohorts — operator analysis only, no PII. */
export type BetaCohort =
  | "general"
  | "internal"
  | "trusted_beta"
  | "category_validation"
  | "gradual";

export const BETA_COHORT_LABELS: Record<BetaCohort, string> = {
  general: "General beta",
  internal: "Internal testers",
  trusted_beta: "Trusted beta users",
  category_validation: "Category validation",
  gradual: "Gradual traffic",
};

const ALLOWED = new Set<BetaCohort>([
  "general",
  "internal",
  "trusted_beta",
  "category_validation",
  "gradual",
]);

export function normalizeBetaCohort(raw?: string | null): BetaCohort {
  const v = raw?.trim().toLowerCase().replace(/-/g, "_") as BetaCohort | undefined;
  if (v && ALLOWED.has(v)) return v;
  return "general";
}

export function defaultBetaCohortFromEnv(): BetaCohort {
  return normalizeBetaCohort(process.env.NEXT_PUBLIC_BETA_COHORT);
}
