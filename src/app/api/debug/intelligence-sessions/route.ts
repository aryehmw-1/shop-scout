import { NextResponse } from "next/server";
import { analyzeSessionQuality } from "@/lib/commerce-intelligence/analytics/session-quality";
import { buildAnalyticsInterpretation } from "@/lib/commerce-intelligence/analytics/interpretation";
import { loadSessionReplay } from "@/lib/commerce-intelligence/session-replay/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEBUG_ROUTES) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const store = loadSessionReplay();

  if (id) {
    const session = store.sessions.find((s) => s.id === id);
    if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ session });
  }

  return NextResponse.json({
    interpretation: buildAnalyticsInterpretation(),
    sessionQuality: analyzeSessionQuality(),
    sessions: store.sessions.slice(0, 100),
    total: store.sessions.length,
  });
}
