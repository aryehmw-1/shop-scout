import { NextResponse } from "next/server";
import { runQualityChecks } from "@/lib/monitoring/quality-alerts";

/**
 * Quality regression monitor — run via Vercel Cron or manual curl.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://yoursite.com/api/cron/monitor-quality
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

  try {
    const alerts = await runQualityChecks();
    const critical = alerts.filter((a) => a.severity === "critical").length;
    const warning = alerts.filter((a) => a.severity === "warning").length;

    if (alerts.length) {
      console.log("[cron/monitor-quality]", { critical, warning, alerts });
    }

    return NextResponse.json({
      ok: true,
      alertCount: alerts.length,
      critical,
      warning,
      alerts,
    });
  } catch (e) {
    console.error("[cron/monitor-quality]", e);
    return NextResponse.json({ error: "Monitor failed" }, { status: 500 });
  }
}
