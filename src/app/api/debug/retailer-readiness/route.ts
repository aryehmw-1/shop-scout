import { NextResponse } from "next/server";
import {
  generateRetailerReadinessReport,
} from "@/lib/ops/retailer-readiness-report";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await generateRetailerReadinessReport();
  return NextResponse.json(report);
}
