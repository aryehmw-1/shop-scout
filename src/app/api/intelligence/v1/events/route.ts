import {
  recordAnalyticsEvent,
  type IntelligenceAnalyticsEvent,
} from "@/lib/commerce-intelligence/analytics/events";
import {
  appendSessionInteraction,
  patchSessionReplayCohort,
} from "@/lib/commerce-intelligence/session-replay/store";
import {
  intelligenceErrorResponse,
  intelligenceJsonResponse,
  withIntelligenceApi,
} from "@/lib/commerce-intelligence/ops/api-guard";

export const dynamic = "force-dynamic";

const ALLOWED: IntelligenceAnalyticsEvent[] = [
  "recommendation_shown",
  "trust_details_open",
  "analyst_mode_open",
  "trust_details_close",
  "offer_click",
  "offer_save",
  "recommendation_ignore",
  "recommendation_no_match",
  "session_abandon",
  "query_category",
  "session_return",
  "onboarding_completed",
  "onboarding_dismissed_early",
  "onboarding_reopened",
];

export const POST = withIntelligenceApi(
  async ({ req, requestId }) => {
    let body: {
      event?: string;
      canonicalId?: string;
      retailer?: string;
      queryCategory?: string;
      sessionId?: string;
      meta?: Record<string, string | number | boolean>;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return intelligenceErrorResponse("invalid_json", "Invalid JSON body", requestId, 400);
    }

    const event = body.event as IntelligenceAnalyticsEvent | undefined;
    if (!event || !ALLOWED.includes(event)) {
      return intelligenceErrorResponse(
        "invalid_payload",
        "Unknown analytics event",
        requestId,
        400,
      );
    }

    const sessionId = body.sessionId?.slice(0, 64);
    recordAnalyticsEvent({
      event,
      canonicalId: body.canonicalId,
      retailer: body.retailer,
      queryCategory: body.queryCategory,
      sessionId,
      meta: body.meta,
    });

    if (sessionId) {
      appendSessionInteraction(sessionId, event);
      const cohort = body.meta?.cohort;
      if (typeof cohort === "string") {
        patchSessionReplayCohort(sessionId, cohort);
      }
    }

    return intelligenceJsonResponse({ ok: true }, requestId);
  },
  { rateLimit: 180, namespace: "events" },
);
