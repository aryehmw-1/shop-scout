import { isAiEnabled } from "@/lib/ai/generate-reply";
import {
  getLivePricingProvider,
  isLivePricingEnabled,
} from "@/lib/search/live-pricing";
import { isAmazonPaapiConfigured } from "@/lib/search/providers/amazon-paapi-config";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    enabled: isAiEnabled(),
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    provider: "OpenAI-compatible",
    clarifyingQuestions: isAiEnabled(),
    livePricing: isLivePricingEnabled(),
    livePricingMode: getLivePricingProvider(),
    amazonPaapi: isAmazonPaapiConfigured(),
  });
}
