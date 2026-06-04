/** Token-bucket style minimum delay between requests per host. */
const lastRequestAt = new Map<string, number>();

export async function throttle(host: string, rps: number): Promise<void> {
  if (rps <= 0) return;
  const minGapMs = Math.ceil(1000 / rps);
  const now = Date.now();
  const last = lastRequestAt.get(host) ?? 0;
  const wait = last + minGapMs - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequestAt.set(host, Date.now());
}
