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

/**
 * Identify the consumer product shown in an image and return a concise shopping
 * search query (brand + product + size/variant). Returns null when no clear
 * product is recognizable. Uses Gemini's multimodal vision on the flash model.
 */
export async function identifyProductFromImage(
  base64: string,
  mimeType: string,
  options: GenerateTextOptions = {},
): Promise<string | null> {
  const model = getGeminiModel(options.model);
  const system =
    "You identify retail products from photos for a shopping price-comparison app. " +
    "Look at the image and output ONLY a short shopping search query a user would " +
    "type to find that exact product — include brand, product name, and size/variant " +
    "if visible (e.g. \"Beats Studio Pro headphones\" or \"Bounty paper towels 12 rolls\"). " +
    "No quotes, no punctuation at the ends, no extra words. " +
    "If the image shows no identifiable retail product, output exactly NO_PRODUCT.";

  const { value } = await withRetry(
    "gemini",
    async () =>
      withTimeout(
        async () => {
          const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType, data: base64 } },
                  { text: "What product is this? Give the shopping search query." },
                ],
              },
            ],
            config: {
              systemInstruction: system,
              temperature: 0.1,
              maxOutputTokens: 80,
              // gemini-2.5-flash "thinking" would otherwise eat the small output
              // budget and truncate the query — disable it for this terse task.
              thinkingConfig: { thinkingBudget: 0 },
            },
          });
          return response.text?.trim() ?? "";
        },
        options.timeoutMs ?? 20_000,
        "gemini",
      ),
    options,
  );

  const cleaned = value.replace(/^["'\s]+|["'.\s]+$/g, "").trim();
  if (!cleaned || /^no[_\s]?product$/i.test(cleaned)) return null;
  // Guard against the model returning a refusal sentence instead of a query.
  if (cleaned.split(/\s+/).length > 12) return null;
  return cleaned;
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
              // When a caller pins the thinking budget (e.g. 0 for terse,
              // well-structured replies), pass it through so the model's hidden
              // reasoning can't eat the output budget and truncate the answer.
              ...(options.thinkingBudget !== undefined
                ? { thinkingConfig: { thinkingBudget: options.thinkingBudget } }
                : {}),
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
