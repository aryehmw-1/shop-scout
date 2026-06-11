import "server-only";

export type AIProviderName = "gemini" | "anthropic";

export interface GenerateTextOptions {
  model?: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  retries?: number;
  /**
   * Gemini-only: token budget for the model's hidden "thinking" pass. Set to 0
   * to disable thinking entirely. Leaving it undefined keeps the model default,
   * which on gemini-2.5-flash silently consumes the output budget and can
   * truncate the visible answer mid-sentence on terse, well-structured tasks.
   */
  thinkingBudget?: number;
  /**
   * Gemini-only: enable Google Search grounding so the model can answer from
   * up-to-date web results (used for product advice/comparison questions where
   * accuracy matters more than latency). Ignored by providers without grounding.
   */
  useWebSearch?: boolean;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AITextResult {
  text: string;
  provider: AIProviderName;
  model: string;
  latencyMs: number;
  retryCount: number;
  usage: AIUsage;
  fallbackUsed?: boolean;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: AIProviderName,
    public readonly safeReason = "provider_failed",
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export const DEFAULT_TIMEOUT_MS = 12_000;
export const DEFAULT_RETRIES = 2;

export function getGeminiModel(model?: string): string {
  return (
    model ??
    process.env.GEMINI_DEFAULT_MODEL ??
    process.env.GEMINI_MODEL ??
    "gemini-2.5-flash"
  );
}

export function getClaudeModel(model?: string): string {
  return (
    model ??
    process.env.ANTHROPIC_DEFAULT_MODEL ??
    process.env.ANTHROPIC_MODEL ??
    "claude-sonnet-4-6"
  );
}

export function aiLog(
  event: string,
  payload: Record<string, string | number | boolean | undefined>,
) {
  console.info(`[ai:${event}]`, JSON.stringify(payload));
}

export function safeErrorReason(error: unknown): string {
  if (error instanceof AIProviderError) return error.safeReason;
  if (error instanceof Error && /timeout|abort/i.test(error.message)) return "timeout";
  return "provider_failed";
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(
  task: () => Promise<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  provider: AIProviderName,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AIProviderError("AI provider timed out.", provider, "timeout"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withRetry<T>(
  provider: AIProviderName,
  task: () => Promise<T>,
  options: GenerateTextOptions,
): Promise<{ value: T; retryCount: number; latencyMs: number }> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const started = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const value = await task();
      return { value, retryCount: attempt, latencyMs: Date.now() - started };
    } catch (error) {
      lastError = error;
      aiLog("retry", {
        provider,
        attempt,
        retries,
        reason: safeErrorReason(error),
      });
      if (attempt >= retries) break;
      await sleep(250 * 2 ** attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AIProviderError("AI provider failed.", provider);
}
