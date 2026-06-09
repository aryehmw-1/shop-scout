import { generateGeminiText, isGeminiConfigured } from "@/lib/ai";
import { NextResponse } from "next/server";

/**
 * Live Gemini health check. Performs a tiny real generation so we can see the
 * actual provider error (invalid key, permission denied, region block, etc.)
 * from production — `/api/ai/status` only checks that the env var is present.
 * Never returns the key itself.
 */
export async function GET() {
  if (!isGeminiConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      reason: "GEMINI_API_KEY is not set in this environment.",
    });
  }

  try {
    const result = await generateGeminiText("Reply with exactly: OK", {
      maxOutputTokens: 8,
      temperature: 0,
      retries: 0,
      timeoutMs: 12_000,
    });
    return NextResponse.json({
      ok: true,
      configured: true,
      model: result.model,
      sample: result.text.slice(0, 40),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      ok: false,
      configured: true,
      reason: message.slice(0, 300),
    });
  }
}
