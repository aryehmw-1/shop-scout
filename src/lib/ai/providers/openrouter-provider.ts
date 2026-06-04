import type { AIProvider, AIMessage, GenerateOptions, GenerateResult } from "./types";

function apiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim();
}

export const openrouterProvider: AIProvider = {
  id: "openrouter",

  isAvailable() {
    return Boolean(apiKey());
  },

  async generate(messages: AIMessage[], options: GenerateOptions = {}): Promise<GenerateResult | null> {
    const key = apiKey();
    if (!key) return null;

    const model = options.model ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
    const started = Date.now();

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://shop-scout.local",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.5,
          max_tokens: options.maxTokens ?? 800,
        }),
      });

      if (!res.ok) {
        console.error("[openrouter-provider]", res.status, await res.text());
        return null;
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      return {
        text: data.choices?.[0]?.message?.content?.trim() ?? "",
        provider: "openrouter",
        model,
        latencyMs: Date.now() - started,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
      };
    } catch (e) {
      console.error("[openrouter-provider] generate failed", e);
      return null;
    }
  },
};
