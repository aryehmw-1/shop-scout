import { NextResponse } from "next/server";
import {
  listExperimentBatches,
  loadExperimentBatch,
} from "@/lib/retailers/experiments/experiment-store";
import { listExperimentPresets } from "@/lib/retailers/experiments/factor-registry";
import { listRetailerCapabilities } from "@/lib/retailers/acquisition/capability-registry";
import { explainAcquisitionPlan } from "@/lib/retailers/acquisition/orchestrator";
import type { RetailerId } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const batchId = url.searchParams.get("batch");
  const retailer = (url.searchParams.get("retailer") ?? "walmart") as RetailerId;

  if (batchId) {
    const batch = await loadExperimentBatch(batchId);
    if (!batch) {
      return NextResponse.json({ error: "batch_not_found" }, { status: 404 });
    }
    return NextResponse.json({ batch });
  }

  const batches = await listExperimentBatches(30);
  const presets = listExperimentPresets();
  const capabilities = listRetailerCapabilities();
  const acquisitionPlan = explainAcquisitionPlan({
    retailerId: retailer,
    url: "https://www.walmart.com/search?q=whole+milk",
  });

  return NextResponse.json({
    batches,
    presets,
    capabilities,
    acquisitionPlan,
  });
}
