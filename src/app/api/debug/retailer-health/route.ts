import { listRetailerHealthSnapshots } from "@/lib/retailers/health/retailer-health";
import { listBandwidthMetrics } from "@/lib/retailers/health/bandwidth-metrics";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    retailers: listRetailerHealthSnapshots(),
    bandwidth: listBandwidthMetrics(),
    updatedAt: new Date().toISOString(),
  });
}
