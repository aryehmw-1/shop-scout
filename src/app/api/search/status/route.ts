import {
  getLivePricingProvider,
  isLivePricingEnabled,
  livePricingStatusMessage,
} from "@/lib/search/live-pricing";
import { isAmazonPaapiConfigured } from "@/lib/search/providers/amazon-paapi-config";
import { NextResponse } from "next/server";

export async function GET() {
  const mode = getLivePricingProvider();

  return NextResponse.json({
    catalog: true,
    livePricing: isLivePricingEnabled(),
    livePricingMode: mode,
    amazonPaapi: isAmazonPaapiConfigured(),
    productPhotos: {
      imageProxy: true,
      catalog: true,
      openFoodFacts: true,
      openverse: true,
      amazonPaapi: isAmazonPaapiConfigured(),
    },
    provider: isAmazonPaapiConfigured() ? "amazon_paapi" : "catalog",
    message: livePricingStatusMessage(),
  });
}
