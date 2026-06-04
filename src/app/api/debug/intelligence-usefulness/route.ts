import { NextResponse } from "next/server";
import { analyzeRecommendationUsefulness } from "@/lib/commerce-intelligence/analytics/usefulness";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DEBUG_ROUTES) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  return NextResponse.json(analyzeRecommendationUsefulness());
}
