import type { ImageQualityMeta } from "./types";

const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /no[-_]?image/i,
  /coming[-_]?soon/i,
  /default[-_]?product/i,
  /image[-_]?not[-_]?available/i,
  /1x1\.(gif|png)/i,
];

const BANNER_PATTERNS = [
  /banner/i,
  /hero[-_]?/i,
  /promo[-_]?/i,
  /wide[-_]?/i,
  /leaderboard/i,
];

const THUMB_PATTERNS = [
  /thumb(nail)?/i,
  /_xs\./i,
  /_sm\./i,
  /w=\d{1,2}(&|$)/i,
  /width=\d{1,2}(&|$)/i,
];

/** Parse width/height from common CDN query params when present in URL. */
export function parseDimensionsFromUrl(url: string): { width?: number; height?: number } {
  try {
    const u = new URL(url);
    const w =
      Number(u.searchParams.get("w") ?? u.searchParams.get("width") ?? "") || undefined;
    const h =
      Number(u.searchParams.get("h") ?? u.searchParams.get("height") ?? "") || undefined;
    if (w && w > 0 && w < 10000) return { width: w, height: h && h > 0 ? h : undefined };
  } catch {
    /* relative or invalid */
  }
  const dimMatch = url.match(/(\d{3,4})x(\d{3,4})/);
  if (dimMatch) {
    return { width: Number(dimMatch[1]), height: Number(dimMatch[2]) };
  }
  return {};
}

export function scoreImageQuality(url: string): ImageQualityMeta {
  const lower = url.toLowerCase();
  const isPlaceholder = PLACEHOLDER_PATTERNS.some((p) => p.test(lower));
  const isBanner = BANNER_PATTERNS.some((p) => p.test(lower));
  const isThumbnail = THUMB_PATTERNS.some((p) => p.test(lower));
  const { width, height } = parseDimensionsFromUrl(url);
  const aspectRatio =
    width && height && height > 0 ? Math.round((width / height) * 100) / 100 : undefined;

  let imageQualityScore = 0.55;
  if (isPlaceholder) imageQualityScore = 0.05;
  else if (isBanner) imageQualityScore = 0.25;
  else if (isThumbnail) imageQualityScore = 0.35;
  else {
    if (width && width >= 800) imageQualityScore += 0.25;
    else if (width && width >= 400) imageQualityScore += 0.15;
    if (aspectRatio && aspectRatio >= 0.65 && aspectRatio <= 1.35) {
      imageQualityScore += 0.08;
    }
    if (/\.(jpg|jpeg|webp)(\?|$)/i.test(lower)) imageQualityScore += 0.05;
  }

  return {
    url,
    width,
    height,
    aspectRatio,
    imageQualityScore: Math.min(1, imageQualityScore),
    isPlaceholder,
    isBanner,
    isThumbnail,
    imageHash: undefined,
  };
}

export function pickBestImage(candidates: string[]): ImageQualityMeta | undefined {
  const scored = candidates
    .filter((u) => u?.startsWith("http"))
    .map((u) => scoreImageQuality(u))
    .filter((m) => !m.isPlaceholder && !m.isBanner)
    .sort((a, b) => b.imageQualityScore - a.imageQualityScore);
  return scored[0];
}

export function imageQualityToJson(meta: ImageQualityMeta): string {
  return JSON.stringify(meta);
}
