import "server-only";

import {
  AIProviderError,
  aiLog,
  getClaudeModel,
  getGeminiModel,
  safeErrorReason,
  type AIProviderName,
  type AITextResult,
  type GenerateTextOptions,
} from "./common";
import { generateClaudeText, isClaudeConfigured } from "./anthropic";
import { generateGeminiText, isGeminiConfigured } from "./gemini";

export type { AIProviderName, AITextResult, AIUsage, GenerateTextOptions } from "./common";
export { AIProviderError } from "./common";
export { generateClaudeText, isClaudeConfigured } from "./anthropic";
export { generateGeminiText, isGeminiConfigured } from "./gemini";

export interface GenerateAITextOptions extends GenerateTextOptions {
  provider?: AIProviderName;
  fallbackProvider?: AIProviderName | false;
  fallbackModel?: string;
}

function providerIsConfigured(provider: AIProviderName): boolean {
  return provider === "gemini" ? isGeminiConfigured() : isClaudeConfigured();
}

function providerModel(provider: AIProviderName, model?: string): string {
  return provider === "gemini" ? getGeminiModel(model) : getClaudeModel(model);
}

function callProvider(
  provider: AIProviderName,
  prompt: string,
  options: GenerateTextOptions,
): Promise<AITextResult> {
  return provider === "gemini"
    ? generateGeminiText(prompt, options)
    : generateClaudeText(prompt, options);
}

export async function generateAIText(
  prompt: string,
  options: GenerateAITextOptions = {},
): Promise<AITextResult> {
  const primary = options.provider ?? "gemini";
  const fallback =
    options.fallbackProvider === false
      ? undefined
      : options.fallbackProvider ?? (primary === "gemini" ? "anthropic" : "gemini");

  const { fallbackModel, fallbackProvider, provider, ...baseOptions } = options;

  try {
    if (!providerIsConfigured(primary)) {
      throw new AIProviderError(
        `${primary} is not configured.`,
        primary,
        "missing_api_key",
      );
    }

    return await callProvider(primary, prompt, baseOptions);
  } catch (error) {
    aiLog("failure", {
      provider: primary,
      model: providerModel(primary, baseOptions.model),
      reason: safeErrorReason(error),
    });

    if (!fallback || !providerIsConfigured(fallback)) {
      throw error instanceof AIProviderError
        ? error
        : new AIProviderError("Primary AI provider failed.", primary, safeErrorReason(error));
    }

    const fallbackOptions: GenerateTextOptions = {
      ...baseOptions,
      model: fallbackModel,
    };

    try {
      const result = await callProvider(fallback, prompt, fallbackOptions);
      return { ...result, fallbackUsed: true };
    } catch (fallbackError) {
      aiLog("failure", {
        provider: fallback,
        model: providerModel(fallback, fallbackModel),
        reason: safeErrorReason(fallbackError),
      });

      throw fallbackError instanceof AIProviderError
        ? fallbackError
        : new AIProviderError(
            "Fallback AI provider failed.",
            fallback,
            safeErrorReason(fallbackError),
          );
    }
  }
}
