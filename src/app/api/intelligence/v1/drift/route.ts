import { NextResponse } from "next/server";
import { intelligenceDriftReport } from "@/lib/commerce-intelligence/service/intelligence-api";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(intelligenceDriftReport());
}
