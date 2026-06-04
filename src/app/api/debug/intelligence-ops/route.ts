import { NextResponse } from "next/server";
import { buildBetaOperatorSummary } from "@/lib/commerce-intelligence/analytics/beta-operator-summary";
import { buildBetaLearningReport } from "@/lib/commerce-intelligence/analytics/beta-learning-report";
import { analyzeSessionSuccess } from "@/lib/commerce-intelligence/analytics/session-success";
import { assessRuntimeSafety } from "@/lib/commerce-intelligence/ops/runtime-safety";
import { buildAnalyticsInterpretation } from "@/lib/commerce-intelligence/analytics/interpretation";
import { analyzeRecommendationUsefulness } from "@/lib/commerce-intelligence/analytics/usefulness";
import { buildBetaAlerts } from "@/lib/commerce-intelligence/ops/beta-alerts";
import { buildLaunchAlerts } from "@/lib/commerce-intelligence/ops/launch-alerts";
import { runDeployVerification } from "@/lib/commerce-intelligence/ops/deploy-verify";
import { getLaunchFlagsSnapshot } from "@/lib/commerce-intelligence/ops/feature-flags";
import { buildIntelligenceObservabilitySnapshot } from "@/lib/commerce-intelligence/ops/observability";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { intelligenceGraphDir } from "@/lib/commerce-intelligence/storage-root";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEBUG_ROUTES) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const snapshot = buildIntelligenceObservabilitySnapshot();
  const maintenancePath = join(intelligenceGraphDir(), "ops-snapshot.json");
  let lastMaintenance = null;
  if (existsSync(maintenancePath)) {
    try {
      lastMaintenance = JSON.parse(readFileSync(maintenancePath, "utf8"));
    } catch {
      lastMaintenance = null;
    }
  }

  return NextResponse.json({
    snapshot,
    lastMaintenance,
    launch: {
      flags: getLaunchFlagsSnapshot(),
      alerts: buildLaunchAlerts(),
      deploy: runDeployVerification(),
    },
    usefulness: analyzeRecommendationUsefulness(),
    interpretation: buildAnalyticsInterpretation(),
    beta: {
      summary: buildBetaOperatorSummary(),
      sessionSuccess: analyzeSessionSuccess(),
      learning: buildBetaLearningReport(),
      alerts: buildBetaAlerts(),
      runtime: assessRuntimeSafety(),
    },
  });
}
