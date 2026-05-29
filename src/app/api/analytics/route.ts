import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { recordAnalyticsEvent } from "@/lib/analytics/record";
import type { AnalyticsEvent } from "@/lib/analytics/events";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyticsEvent;
    if (!body?.name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const userId = (await getSessionUserId()) ?? undefined;
    await recordAnalyticsEvent(body, userId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/analytics]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
