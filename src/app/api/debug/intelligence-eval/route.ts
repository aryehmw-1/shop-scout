import { NextResponse } from "next/server";
import { runFullIntelligenceEval } from "@/lib/commerce-intelligence/eval/run-full-eval";

export const dynamic = "force-dynamic";

/** Trust, calibration & golden-query evaluation (dev/QA). */
export async function GET() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEBUG_ROUTES) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const report = runFullIntelligenceEval();
  return NextResponse.json(report);
}
