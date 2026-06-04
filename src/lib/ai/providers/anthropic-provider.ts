import type { AIProvider, AIMessage, GenerateOptions, GenerateResult } from "./types";

function apiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY?.trim();
}

export const anthropicProvider: AIProvider = {
  id: "anthropic",

  isAvailable() {
    return Boolean(apiKey());
  },

  async generate(messages: AIMessage[], options: GenerateOptions = {}): Promise<GenerateResult | null> {
    const key = apiKey();
    if (!key) return null;

    const model =
      options.model ??
      process.env.ANTHROPIC_DEFAULT_MODEL ??
      process.env.ANTHROPIC_MODEL ??
      "claude-sonnet-4-0";
    const system = messages.find((m) => m.role === "system")?.content;
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const started = Date.now();
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens ?? 800,
          temperature: options.temperature ?? 0.5,
          system: system ?? undefined,
          messages: chatMessages,
        }),
      });

      if (!res.ok) {
        console.error("[anthropic-provider]", res.status, await res.text());
        return null;
      }

      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text =
        data.content?.find((c) => c.type === "text")?.text?.trim() ?? "";

      return {
        text,
        provider: "anthropic",
        model,
        latencyMs: Date.now() - started,
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        },
      };
    } catch (e) {
      console.error("[anthropic-provider] generate failed", e);
      return null;
    }
  },
};
