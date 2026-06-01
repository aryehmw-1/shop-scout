import { NextResponse } from "next/server";
import {
  listRetailerCapabilities,
  enrichCapabilityWithMetrics,
  getRetailerCapability,
} from "@/lib/retailers/acquisition/capability-registry";
import { explainAcquisitionPlan } from "@/lib/retailers/acquisition/orchestrator";
import { summarizeOrchestrationMetrics } from "@/lib/retailers/acquisition/orchestration-metrics";
import { listCachedPaths } from "@/lib/retailers/acquisition/path-cache";
import { getTransportPolicy } from "@/lib/retailers/acquisition/transport-policy";
import { getRetailerMetadata } from "@/lib/retailers/acquisition/retailer-metadata-registry";
import type { RetailerId } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const retailer = (url.searchParams.get("retailer") ?? "amazon") as RetailerId;
  const targetUrl =
    url.searchParams.get("url") ??
    (retailer === "amazon" ?
      "https://www.amazon.com/dp/B000GATZLO"
    : retailer === "target" ?
      "https://www.target.com/s?searchTerm=whole+milk"
    : "https://www.walmart.com/search?q=whole+milk");

  const [orchestrationMetrics, cachedPaths] = await Promise.all([
    summarizeOrchestrationMetrics(),
    listCachedPaths(),
  ]);

  const capabilities = listRetailerCapabilities().map(enrichCapabilityWithMetrics);
  const capability = enrichCapabilityWithMetrics(getRetailerCapability(retailer));
  const plan = explainAcquisitionPlan({ retailerId: retailer, url: targetUrl });
  const metadata = getRetailerMetadata(retailer);
  const transportPolicy = getTransportPolicy(retailer);

  return NextResponse.json({
    capabilities,
    capability,
    metadata,
    transportPolicy,
    plan,
    orchestrationMetrics,
    cachedPaths,
  });
}
