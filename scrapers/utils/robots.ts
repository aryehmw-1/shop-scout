import { fetchHtml } from "./http";

const cache = new Map<string, { fetchedAt: number; disallow: string[] }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function parseDisallow(robotsTxt: string): string[] {
  const lines = robotsTxt.split("\n");
  const disallow: string[] = [];
  let applies = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [key, ...rest] = line.split(":").map((s) => s.trim());
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(key)) {
      applies = value === "*" || /bot|crawler|spider/i.test(value);
      continue;
    }
    if (applies && /^disallow$/i.test(key) && value) {
      disallow.push(value);
    }
  }
  return disallow;
}

export async function isAllowedByRobots(
  url: string,
  opts: { userAgent: string; timeoutMs: number },
): Promise<boolean> {
  try {
    const { origin } = new URL(url);
    const cached = cache.get(origin);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      return pathAllowed(url, cached.disallow);
    }

    const robotsUrl = `${origin}/robots.txt`;
    const txt = await fetchHtml(robotsUrl, {
      timeoutMs: opts.timeoutMs,
      userAgent: opts.userAgent,
      rateLimitRps: 1,
    });
    const disallow = txt ? parseDisallow(txt) : [];
    cache.set(origin, { fetchedAt: now, disallow });
    return pathAllowed(url, disallow);
  } catch {
    return true;
  }
}

function pathAllowed(url: string, disallow: string[]): boolean {
  const path = new URL(url).pathname;
  for (const rule of disallow) {
    if (rule === "/") return false;
    if (rule.length > 1 && path.startsWith(rule)) return false;
  }
  return true;
}
