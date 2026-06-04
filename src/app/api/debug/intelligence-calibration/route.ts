import { NextResponse } from "next/server";
import { loadAllGraphs } from "@/lib/commerce-intelligence/graph/store";
import { analyzeCalibration } from "@/lib/commerce-intelligence/eval/calibration";
import { loadEvalHistory } from "@/lib/commerce-intelligence/eval/history";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEBUG_ROUTES) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const graphs = loadAllGraphs();
  const calibration = analyzeCalibration(graphs);
  const history = loadEvalHistory();

  return NextResponse.json({ calibration, history });
}
