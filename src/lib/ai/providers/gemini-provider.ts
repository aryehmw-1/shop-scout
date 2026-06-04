import type { AIProvider, AIMessage, GenerateOptions, GenerateResult } from "./types";

function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() ?? process.env.GOOGLE_API_KEY?.trim();
}

export const geminiProvider: AIProvider = {
  id: "gemini",

  isAvailable() {
    return Boolean(apiKey());
  },

  async generate(messages: AIMessage[], options: GenerateOptions = {}): Promise<GenerateResult | null> {
    const key = apiKey();
    if (!key) return null;

    const model =
      options.model ??
      process.env.GEMINI_DEFAULT_MODEL ??
      process.env.GEMINI_MODEL ??
      "gemini-2.5-flash";
    const started = Date.now();

    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find((m) => m.role === "system")?.content;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          contents,
          generationConfig: {
            temperature: options.temperature ?? 0.5,
            maxOutputTokens: options.maxTokens ?? 800,
          },
        }),
      });

      if (!res.ok) {
        console.error("[gemini-provider]", res.status, await res.text());
        return null;
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

      return {
        text,
        provider: "gemini",
        model,
        latencyMs: Date.now() - started,
      };
    } catch (e) {
      console.error("[gemini-provider] generate failed", e);
      return null;
    }
  },
};
