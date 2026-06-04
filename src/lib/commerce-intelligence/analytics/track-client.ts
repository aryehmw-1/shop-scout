"use client";

import { getBetaCohort } from "../beta/cohort-client";
import type { IntelligenceAnalyticsEvent } from "./events";
import { getIntelligenceSessionId } from "./session-id";

/** Fire-and-forget product analytics — no PII. */
export function trackIntelligenceEvent(
  event: IntelligenceAnalyticsEvent,
  meta?: {
    canonicalId?: string;
    retailer?: string;
    queryCategory?: string;
    sessionId?: string;
    /** Privacy-safe flags (e.g. clickedWinner). */
    meta?: Record<string, string | number | boolean>;
  },
): void {
  const sessionId = meta?.sessionId ?? getIntelligenceSessionId();
  const { meta: eventMeta, ...rest } = meta ?? {};
  const cohort = getBetaCohort();

  void fetch("/api/intelligence/v1/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      ...rest,
      sessionId,
      meta: { ...eventMeta, cohort },
    }),
    keepalive: true,
  }).catch(() => {});
}
