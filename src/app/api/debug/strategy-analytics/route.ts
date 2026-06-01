import { NextResponse } from "next/server";
import {
  strategyEffectiveness,
  recommendTransports,
} from "@/lib/retailers/health/strategy-metrics";
import {
  listRetailerFetchStrategies,
  listTransportPolicies,
} from "@/lib/retailers/fetch-strategy";
import { listSessionBehaviors } from "@/lib/retailers/session-behavior";
import { RETAILER_DIFFICULTY } from "@/lib/retailers/browser-realism";
import {
  extractionBlockSummary,
  recentExtractionArtifacts,
} from "@/lib/retailers/extraction-artifacts";
// import { isRenderedFetchEnabled } from "@/lib/offers/retailer-adapters/rendered-fetch";
import { availableTransports, describeProxyConfig } from "@/lib/net/proxy-routing";
import type { RetailerId } from "@/lib/types";

const CORE_RETAILERS: RetailerId[] = ["amazon", "walmart", "target", "kroger", "costco", "aldi"];

export async function GET() {
  const [blockSummary, recent] = await Promise.all([
    extractionBlockSummary(),
    recentExtractionArtifacts(40),
  ]);
  const proxy = describeProxyConfig();
  return NextResponse.json({
    renderedEnabled: false, // isRenderedFetchEnabled() — rendered-fetch temporarily disabled
    transports: {
      available: availableTransports(),
      configured: proxy.transports,
      policies: listTransportPolicies(CORE_RETAILERS),
    },
    transportRecommendations: recommendTransports(),
    effectiveness: strategyEffectiveness(),
    strategies: listRetailerFetchStrategies(CORE_RETAILERS),
    behaviors: listSessionBehaviors(),
    retailerDifficulty: RETAILER_DIFFICULTY,
    challengeVault: { summary: blockSummary, recent },
    updatedAt: new Date().toISOString(),
  });
}
