import "server-only";

import { GoogleGenAI } from "@google/genai";
import {
  AIProviderError,
  aiLog,
  getGeminiModel,
  type AITextResult,
  type GenerateTextOptions,
  withRetry,
  withTimeout,
} from "./common";

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new AIProviderError("Gemini API key is not configured.", "gemini", "missing_api_key");
  }
  return key;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export async function generateGeminiText(
  prompt: string,
  options: GenerateTextOptions = {},
): Promise<AITextResult> {
  const model = getGeminiModel(options.model);

  const { value, retryCount, latencyMs } = await withRetry(
    "gemini",
    async () =>
      withTimeout(
        async () => {
          const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction: options.system,
              temperature: options.temperature ?? 0.4,
              maxOutputTokens: options.maxOutputTokens ?? 700,
            },
          });

          const text = response.text?.trim() ?? "";
          if (!text) {
            throw new AIProviderError("Gemini returned an empty response.", "gemini", "empty_response");
          }

          const usage = response.usageMetadata;
          return {
            text,
            usage: {
              inputTokens: usage?.promptTokenCount ?? 0,
              outputTokens: usage?.candidatesTokenCount ?? 0,
              totalTokens: usage?.totalTokenCount ?? 0,
            },
          };
        },
        options.timeoutMs,
        "gemini",
      ),
    options,
  );

  aiLog("success", {
    provider: "gemini",
    model,
    latencyMs,
    retryCount,
    inputTokens: value.usage.inputTokens,
    outputTokens: value.usage.outputTokens,
    totalTokens: value.usage.totalTokens,
  });

  return {
    text: value.text,
    provider: "gemini",
    model,
    latencyMs,
    retryCount,
    usage: value.usage,
  };
}
