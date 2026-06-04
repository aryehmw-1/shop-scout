import {
  generateClaudeText,
  generateGeminiText,
  isClaudeConfigured,
  isGeminiConfigured,
} from "@/lib/ai";
import { safeErrorReason, type AIProviderName } from "@/lib/ai/common";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function testProvider(provider: AIProviderName) {
  const configured =
    provider === "gemini" ? isGeminiConfigured() : isClaudeConfigured();

  if (!configured) {
    return {
      provider,
      configured: false,
      ok: false,
      reason: "missing_api_key",
    };
  }

  try {
    const result =
      provider === "gemini"
        ? await generateGeminiText("Reply with exactly: Shop Scout AI ready.", {
            maxOutputTokens: 24,
            retries: 0,
            temperature: 0,
            timeoutMs: 8_000,
          })
        : await generateClaudeText("Reply with exactly: Shop Scout AI ready.", {
            maxOutputTokens: 24,
            retries: 0,
            temperature: 0,
            timeoutMs: 8_000,
          });

    return {
      provider,
      configured: true,
      ok: true,
      model: result.model,
      latencyMs: result.latencyMs,
      retryCount: result.retryCount,
      usage: result.usage,
    };
  } catch (error) {
    return {
      provider,
      configured: true,
      ok: false,
      reason: safeErrorReason(error),
    };
  }
}

export async function GET() {
  const [gemini, anthropic] = await Promise.all([
    testProvider("gemini"),
    testProvider("anthropic"),
  ]);

  return NextResponse.json({
    ok: gemini.ok || anthropic.ok,
    primary: "gemini",
    fallback: "anthropic",
    providers: [gemini, anthropic],
  });
}
