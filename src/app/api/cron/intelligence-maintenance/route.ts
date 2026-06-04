import { NextResponse } from "next/server";
import { runIntelligenceMaintenance } from "@/lib/commerce-intelligence/ops/maintenance";
import { runFullIntelligenceEvalAndSave } from "@/lib/commerce-intelligence/eval/run-full-eval";

/**
 * Scheduled intelligence learning: eval + snapshots + memory + observability.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://yoursite.com/api/cron/intelligence-maintenance
 *   curl "...?eval=1"  # also run full eval + regression gates
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
  const runEval = url.searchParams.get("eval") === "1";

  try {
    let evalReport = null;
    if (runEval) {
      evalReport = runFullIntelligenceEvalAndSave();
    } else {
      runIntelligenceMaintenance("cron");
    }

    if (runEval) {
      return NextResponse.json({
        ok: true,
        evalRan: true,
        regressionPassed: evalReport!.regressionGates.passed,
        adversarialPassRate:
          evalReport!.adversarial.total > 0 ?
            evalReport!.adversarial.passed / evalReport!.adversarial.total
          : 1,
      });
    }

    const maintenance = runIntelligenceMaintenance("cron");
    return NextResponse.json({ ok: true, evalRan: false, maintenance });
  } catch (e) {
    console.error("[cron/intelligence-maintenance]", e);
    return NextResponse.json({ error: "Maintenance failed" }, { status: 500 });
  }
}

export const maxDuration = 120;
