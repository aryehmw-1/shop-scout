import { runDailyPriceCheck } from "@/lib/own-db/daily-check";
import { getFullIndexRotationPlan } from "@/lib/indexing/weekly-retailer-schedule";
import { NextResponse } from "next/server";

/**
 * Once-per-day price + photo check for every catalog product.
 * Secure with CRON_SECRET (Vercel Cron, GitHub Actions, or manual curl).
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://yoursite.com/api/cron/daily-index
 *   curl "http://localhost:3000/api/cron/daily-index?full=1"   # all 156 retailers tonight
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const fullIndex =
    url.searchParams.get("full") === "1" ||
    url.searchParams.get("rotation") === "off" ||
    process.env.WEEKLY_STORE_ROTATION === "off";

  try {
    const report = await runDailyPriceCheck({
      delayMs: 400,
      rotationPlan: fullIndex ? getFullIndexRotationPlan() : undefined,
    });
    return NextResponse.json({ ok: true, fullIndex, ...report });
  } catch (e) {
    console.error("[cron/daily-index]", e);
    return NextResponse.json({ error: "Daily index failed" }, { status: 500 });
  }
}

export const maxDuration = 300;
