/**
 * Simple async queue with concurrency limit and per-task retries.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  opts?: { retries?: number; retryDelayMs?: number },
): Promise<R[]> {
  const retries = opts?.retries ?? 0;
  const retryDelayMs = opts?.retryDelayMs ?? 500;
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      let lastErr: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          results[i] = await fn(items[i]!, i);
          lastErr = undefined;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt < retries) {
            await sleep(retryDelayMs * (attempt + 1));
          }
        }
      }
      if (lastErr !== undefined) {
        throw lastErr;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
