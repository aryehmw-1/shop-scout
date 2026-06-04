import type {
  AIProvider,
  AIMessage,
  ClassifyOptions,
  ClassifyResult,
  GenerateOptions,
  GenerateResult,
} from "./types";

function baseUrl(): string {
  return (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
}

function apiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim();
}

export const openaiProvider: AIProvider = {
  id: "openai",

  isAvailable() {
    return Boolean(apiKey());
  },

  async generate(messages: AIMessage[], options: GenerateOptions = {}): Promise<GenerateResult | null> {
    const key = apiKey();
    if (!key) return null;
    const model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const started = Date.now();

    try {
      const res = await fetch(`${baseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: options.temperature ?? 0.5,
          max_tokens: options.maxTokens ?? 800,
          messages,
          ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      if (!res.ok) {
        console.error("[openai-provider]", res.status, await res.text());
        return null;
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const text = data.choices?.[0]?.message?.content?.trim() ?? "";
      return {
        text,
        provider: "openai",
        model,
        latencyMs: Date.now() - started,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
      };
    } catch (e) {
      console.error("[openai-provider] generate failed", e);
      return null;
    }
  },

  async classify(text: string, options: ClassifyOptions): Promise<ClassifyResult | null> {
    const labels = options.labels.join(", ");
    const result = await this.generate(
      [
        {
          role: "system",
          content: `Classify the user text into exactly one label: ${labels}. Reply JSON: {"label":"","confidence":0.0}`,
        },
        { role: "user", content: text },
      ],
      { model: options.model ?? process.env.OPENAI_MODEL_FAST ?? "gpt-4o-mini", jsonMode: true, maxTokens: 80 },
    );
    if (!result?.text) return null;
    try {
      const parsed = JSON.parse(result.text) as { label?: string; confidence?: number };
      return {
        label: parsed.label ?? options.labels[0]!,
        confidence: parsed.confidence ?? 0.5,
        provider: "openai",
        latencyMs: result.latencyMs,
      };
    } catch {
      return null;
    }
  },
};
