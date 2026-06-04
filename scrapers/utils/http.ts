import { throttle } from "./throttle";

export interface FetchHtmlOptions {
  timeoutMs: number;
  userAgent: string;
  rateLimitRps: number;
}

export async function fetchHtml(url: string, opts: FetchHtmlOptions): Promise<string | null> {
  const host = new URL(url).hostname;
  await throttle(host, opts.rateLimitRps);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": opts.userAgent,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function headStatus(
  url: string,
  opts: { timeoutMs: number; userAgent: string },
): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": opts.userAgent },
      redirect: "follow",
    });
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
