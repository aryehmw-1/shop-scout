import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import {
  AIProviderError,
  aiLog,
  getClaudeModel,
  type AITextResult,
  type GenerateTextOptions,
  withRetry,
  withTimeout,
} from "./common";

function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new AIProviderError(
      "Anthropic API key is not configured.",
      "anthropic",
      "missing_api_key",
    );
  }
  return key;
}

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export async function generateClaudeText(
  prompt: string,
  options: GenerateTextOptions = {},
): Promise<AITextResult> {
  const model = getClaudeModel(options.model);

  const { value, retryCount, latencyMs } = await withRetry(
    "anthropic",
    async () =>
      withTimeout(
        async () => {
          const client = new Anthropic({
            apiKey: getAnthropicApiKey(),
            maxRetries: 0,
            timeout: options.timeoutMs,
          });
          const response = await client.messages.create({
            model,
            max_tokens: options.maxOutputTokens ?? 700,
            temperature: options.temperature ?? 0.4,
            system: options.system,
            messages: [{ role: "user", content: prompt }],
          });

          const text = response.content
            .map((block) => (block.type === "text" ? block.text : ""))
            .join("\n")
            .trim();
          if (!text) {
            throw new AIProviderError(
              "Claude returned an empty response.",
              "anthropic",
              "empty_response",
            );
          }

          const inputTokens = response.usage.input_tokens ?? 0;
          const outputTokens = response.usage.output_tokens ?? 0;

          return {
            text,
            usage: {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
          };
        },
        options.timeoutMs,
        "anthropic",
      ),
    options,
  );

  aiLog("success", {
    provider: "anthropic",
    model,
    latencyMs,
    retryCount,
    inputTokens: value.usage.inputTokens,
    outputTokens: value.usage.outputTokens,
    totalTokens: value.usage.totalTokens,
  });

  return {
    text: value.text,
    provider: "anthropic",
    model,
    latencyMs,
    retryCount,
    usage: value.usage,
  };
}
