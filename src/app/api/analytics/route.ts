import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { recordAnalyticsEvent } from "@/lib/analytics/record";
import { recordIntelligence } from "@/lib/analytics/intelligence";
import { capturePostHogServer } from "@/lib/analytics/posthog-server";
import type { AnalyticsEvent } from "@/lib/analytics/events";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyticsEvent;
    if (!body?.name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const userId = (await getSessionUserId()) ?? undefined;
    const sessionId = body.sessionId ?? undefined;

    // 1) Lightweight LearningEvent log (existing behavior).
    // 2) Dedicated intelligence tables (SearchEvent/ProductClick/MissingProduct).
    // 3) Server-side PostHog. All best-effort and run in parallel.
    await Promise.allSettled([
      recordAnalyticsEvent(body, userId),
      recordIntelligence(body, { userId, sessionId }),
      capturePostHogServer(body, { userId, sessionId }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/analytics]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
