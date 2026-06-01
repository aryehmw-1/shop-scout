import { NextResponse } from "next/server";
import { ingestionEfficiencySummary } from "@/lib/retailers/health/ingestion-efficiency";
import { listProxyObservability } from "@/lib/net/proxy-observability";
import { blockingReportSummary } from "@/lib/net/request-blocking-report";
import { getProxyPool, proxyRedacted, describeProxyConfig } from "@/lib/net/proxy-routing";
import { listRetailerFetchStrategies } from "@/lib/retailers/fetch-strategy";
import {
  extractionBlockSummary,
  recentExtractionArtifacts,
} from "@/lib/retailers/extraction-artifacts";
import type { RetailerId } from "@/lib/types";

const CORE_RETAILERS: RetailerId[] = ["amazon", "walmart", "target", "kroger", "costco", "aldi"];

export async function GET() {
  const pool = getProxyPool();
  const proxyConfig = describeProxyConfig();
  const [blockSummary, recentBlocks] = await Promise.all([
    extractionBlockSummary(),
    recentExtractionArtifacts(25),
  ]);
  return NextResponse.json({
    efficiency: ingestionEfficiencySummary(),
    proxyObservability: listProxyObservability(),
    requestBlocking: blockingReportSummary(),
    fetchStrategies: listRetailerFetchStrategies(CORE_RETAILERS),
    antiBot: { summary: blockSummary, recent: recentBlocks },
    proxyConfig,
    proxyAvailability: {
      enabled: proxyConfig.enabled,
      provider: proxyConfig.provider,
      mode: proxyConfig.mode,
      configuredCount: pool.length,
      configured: pool.map(proxyRedacted),
      directFirst: (process.env.INDEX_PROXY_DIRECT_FIRST ?? "1") !== "0",
      forceAll: process.env.INDEX_PROXY_FORCE_ALL === "1",
      warnings: proxyConfig.warnings,
    },
    updatedAt: new Date().toISOString(),
  });
}
