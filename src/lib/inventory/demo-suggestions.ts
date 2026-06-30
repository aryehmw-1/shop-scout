/**
 * Shared demo suggestions — grocery-first, honest about coverage.
 * @deprecated Prefer onboarding-examples.ts for dynamic maturity-aware chips.
 */

export {
  GROCERY_ONBOARDING_EXAMPLES as GROCERY_DEMO_CHIPS,
  APPAREL_ONBOARDING_EXAMPLES as APPAREL_DEMO_CHIPS,
  VERIFIED_RECOVERY_SUGGESTIONS,
  getWelcomeChips,
  getDynamicOnboardingChips,
} from "./onboarding-examples";

import { GROCERY_ONBOARDING_EXAMPLES } from "./onboarding-examples";

/** Default chat quick picks — lead with verified grocery categories. */
export const DEFAULT_CHAT_CHIPS = [
  ...GROCERY_ONBOARDING_EXAMPLES.slice(0, 3),
  // Surfaces the AI Shopping Planner (P5) — a grouped multi-category plan.
  "Cleaning supplies for a family of 5",
  "Paste an Amazon link",
] as const;

export const ZIP_SET_CHAT_CHIPS = [
  ...GROCERY_ONBOARDING_EXAMPLES.slice(0, 3),
  "Paste an Amazon link",
] as const;
