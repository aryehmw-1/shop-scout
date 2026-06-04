import { NextResponse } from "next/server";
import { runDeployVerification } from "@/lib/commerce-intelligence/ops/deploy-verify";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEBUG_ROUTES) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const report = runDeployVerification();
  return NextResponse.json(report, { status: report.ready ? 200 : 503 });
}
