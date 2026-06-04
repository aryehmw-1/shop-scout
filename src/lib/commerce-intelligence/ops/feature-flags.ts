/**
 * Central launch / rollout flags — env-only, no external service required.
 */

export const launchFlags = {
  /** Master switch for intelligence-first search */
  intelligenceEnabled: process.env.INTELLIGENCE_ENABLED !== "0",
  /** Multi-provider LLM routing for chat copy */
  chatRouter: process.env.AI_USE_ROUTER === "1",
  /** A/B trust-summary and ranking experiments */
  experiments: process.env.INTELLIGENCE_EXPERIMENTS !== "0",
  /** Deterministic-only: no LLM calls; graph + fallbacks only */
  safeMode: process.env.INTELLIGENCE_SAFE_MODE === "1",
  /** Skip LLM when no retrieval payload */
  skipUngroundedLlm: process.env.AI_SKIP_UNGROUNDED_LLM === "1",
  /** Scheduled maintenance on ingest/eval/cron */
  maintenance: process.env.INTELLIGENCE_MAINTENANCE !== "0",
  /** Product analytics collection */
  analytics: process.env.INTELLIGENCE_ANALYTICS !== "0",
  /** Internal beta — enables session replay storage and richer debug */
  betaMode: process.env.INTELLIGENCE_BETA_MODE === "1",
  /** Store truncated query in session replay (internal only, max 48 chars) */
  sessionReplayQueries: process.env.INTELLIGENCE_SESSION_REPLAY_QUERIES === "1",
} as const;

export type LaunchFlagKey = keyof typeof launchFlags;

export function getLaunchFlagsSnapshot(): Record<LaunchFlagKey, boolean> {
  return { ...launchFlags };
}
