import type { CheerioAPI } from "cheerio";

const BAD_IMAGE_RE =
  /sprite|logo|icon|badge|placeholder|1x1|pixel|spacer|avatar|banner-ad/i;

/** Pick the best product image URL from HTML (OG, JSON-LD, lazy attrs, srcset). */
export function extractBestImageUrl($: CheerioAPI, pageUrl: string): string | null {
  const candidates: string[] = [];

  const push = (raw?: string | null) => {
    if (!raw) return;
    const url = normalizeImageCandidate(raw, pageUrl);
    if (url && !BAD_IMAGE_RE.test(url)) candidates.push(url);
  };

  push($('meta[property="og:image"]').attr("content"));
  push($('meta[property="og:image:url"]').attr("content"));
  push($('meta[name="twitter:image"]').attr("content"));
  push($('meta[property="product:image"]').attr("content"));
  push($("link[rel='image_src']").attr("href"));
  push($("img[itemprop='image']").attr("src"));
  push($("img[itemprop='image']").attr("data-src"));
  push($("[data-testid*='product'] img").first().attr("src"));
  push($("[class*='ProductImage'] img").first().attr("src"));
  push($("img#landingImage").attr("src"));

  $("img").each((_, el) => {
    const src =
      $(el).attr("src") ??
      $(el).attr("data-src") ??
      $(el).attr("data-lazy-src") ??
      $(el).attr("data-original");
    push(src);
    const srcset = $(el).attr("srcset");
    if (srcset) push(pickLargestFromSrcset(srcset));
  });

  if (!candidates.length) return null;

  const scored = candidates.map((url) => ({ url, score: scoreImageUrl(url) }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.url ?? null;
}

function normalizeImageCandidate(raw: string, base: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;
  try {
    const url = new URL(trimmed, base);
    if (!/^https?:$/i.test(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function pickLargestFromSrcset(srcset: string): string | null {
  const parts = srcset.split(",").map((p) => p.trim());
  let best: { url: string; w: number } | null = null;
  for (const part of parts) {
    const [url, descriptor] = part.split(/\s+/);
    if (!url) continue;
    const w = descriptor?.endsWith("w") ? parseInt(descriptor, 10) : 0;
    if (!best || w > best.w) best = { url, w };
  }
  return best?.url ?? parts[0]?.split(/\s+/)[0] ?? null;
}

function scoreImageUrl(url: string): number {
  let score = 0;
  if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) score += 30;
  if (/\/images?\//i.test(url) || /media\./i.test(url)) score += 10;
  if (/w=\d+|width=\d+/i.test(url)) {
    const m = url.match(/(?:w|width)=(\d+)/i);
    if (m) score += Math.min(40, parseInt(m[1]!, 10) / 20);
  }
  if (url.length > 80) score += 5;
  if (BAD_IMAGE_RE.test(url)) score -= 100;
  return score;
}
