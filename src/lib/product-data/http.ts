import "server-only";

export class ProductProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly safeReason = "provider_failed",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProductProviderError";
  }
}

export class ProductProviderRateLimitError extends ProductProviderError {
  constructor(provider: string, retryAfterMs?: number) {
    super("Product provider rate limited.", provider, "rate_limited", 429);
    this.retryAfterMs = retryAfterMs;
  }

  retryAfterMs?: number;
}

export function safeProductProviderReason(error: unknown): string {
  if (error instanceof ProductProviderError) return error.safeReason;
  if (error instanceof Error && /timeout|abort/i.test(error.message)) return "timeout";
  return "provider_failed";
}

export function productProviderLog(
  event: string,
  payload: Record<string, string | number | boolean | undefined>,
) {
  console.info(`[product-provider:${event}]`, JSON.stringify(payload));
}

export async function fetchJson<T>(
  provider: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 12_000);
  const started = Date.now();

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      next: { revalidate: 0 },
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
      productProviderLog("rate_limit", {
        provider,
        status: res.status,
        latencyMs: Date.now() - started,
      });
      throw new ProductProviderRateLimitError(provider, retryAfterMs);
    }

    if (!res.ok) {
      productProviderLog("failure", {
        provider,
        status: res.status,
        latencyMs: Date.now() - started,
      });
      throw new ProductProviderError(
        `${provider} request failed.`,
        provider,
        "request_failed",
        res.status,
      );
    }

    productProviderLog("success", {
      provider,
      status: res.status,
      latencyMs: Date.now() - started,
    });

    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof ProductProviderError) throw error;
    productProviderLog("failure", {
      provider,
      reason: safeProductProviderReason(error),
      latencyMs: Date.now() - started,
    });
    throw new ProductProviderError(
      `${provider} request failed.`,
      provider,
      safeProductProviderReason(error),
    );
  } finally {
    clearTimeout(timer);
  }
}
