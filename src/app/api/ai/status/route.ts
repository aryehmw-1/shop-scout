import { isAiEnabled } from "@/lib/ai/generate-reply";
import { getClaudeModel, getGeminiModel } from "@/lib/ai/common";
import { isClaudeConfigured, isGeminiConfigured } from "@/lib/ai";
import {
  getLivePricingProvider,
  isLivePricingEnabled,
} from "@/lib/search/live-pricing";
import { isAmazonPaapiConfigured } from "@/lib/search/providers/amazon-paapi-config";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    enabled: isAiEnabled(),
    provider: "Gemini primary with Claude fallback",
    primaryProvider: "gemini",
    fallbackProvider: "anthropic",
    models: {
      gemini: getGeminiModel(),
      anthropic: getClaudeModel(),
    },
    configured: {
      gemini: isGeminiConfigured(),
      anthropic: isClaudeConfigured(),
    },
    clarifyingQuestions: isAiEnabled(),
    livePricing: isLivePricingEnabled(),
    livePricingMode: getLivePricingProvider(),
    amazonPaapi: isAmazonPaapiConfigured(),
  });
}
