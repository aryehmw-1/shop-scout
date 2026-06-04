import { getExperimentVariant, isExperimentEnabled } from "../experiments/variants";

/** Calm uncertainty phrasing — deterministic A/B via canonical id. */
export function formatUncertaintyLine(message: string, seed: string): string {
  const variant =
    isExperimentEnabled() ? getExperimentVariant("uncertainty_tone", seed) : "control";
  if (variant === "a") return `Note: ${message}`;
  if (variant === "b") return `We're not fully certain yet — ${message}`;
  return message;
}
