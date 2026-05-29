/** Normalized size tokens for matching and display. */
export type SizeKind = "alpha" | "waist_inseam" | "shoe" | "numeric" | "volume" | "unknown";

const ALPHA_MAP: Record<string, string> = {
  xs: "XS",
  xsmall: "XS",
  "extra small": "XS",
  s: "S",
  small: "S",
  m: "M",
  medium: "M",
  l: "L",
  large: "L",
  xl: "XL",
  xlarge: "XL",
  "extra large": "XL",
  xxl: "XXL",
  "2xl": "XXL",
  "3xl": "3XL",
};

/** Men's waist (in) often associated with alpha tops — rough guide for search matching. */
const ALPHA_TO_WAIST: Record<string, [number, number]> = {
  XS: [28, 30],
  S: [30, 32],
  M: [32, 34],
  L: [34, 36],
  XL: [36, 38],
  XXL: [38, 42],
};

export function normalizeColor(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeAlphaSize(raw: string): string | undefined {
  const key = raw.trim().toLowerCase().replace(/^size\s+/, "");
  return ALPHA_MAP[key] ?? (key.length <= 3 ? key.toUpperCase() : undefined);
}

export function parseWaistInseam(raw: string): { waist: number; inseam: number } | undefined {
  const m = raw.match(/\b(\d{2})\s*x\s*(\d{2})\b/i);
  if (m) return { waist: parseInt(m[1]!, 10), inseam: parseInt(m[2]!, 10) };
  const slash = raw.match(/\b(\d{2})\s*\/\s*(\d{2})\b/);
  if (slash) return { waist: parseInt(slash[1]!, 10), inseam: parseInt(slash[2]!, 10) };
  return undefined;
}

export function classifySizeKind(raw: string): SizeKind {
  const lower = raw.toLowerCase();
  if (parseWaistInseam(lower)) return "waist_inseam";
  if (/\b(size\s+)?\d{1,2}(?:\.\d)?\b/.test(lower) && /shoe|sneaker|boot/i.test(lower))
    return "shoe";
  if (/\b\d+\s*(oz|lb|gal|ct|pack)\b/i.test(lower)) return "volume";
  if (normalizeAlphaSize(lower)) return "alpha";
  if (/\d/.test(lower)) return "numeric";
  return "unknown";
}

export function normalizeSizeLabel(raw: string): string {
  const wi = parseWaistInseam(raw);
  if (wi) return `${wi.waist}x${wi.inseam}`;
  const alpha = normalizeAlphaSize(raw);
  if (alpha) return alpha;
  return raw.trim();
}

/** True if requested alpha size could reasonably wear this waist (jeans). */
export function alphaMatchesWaist(alpha: string, waist: number): boolean {
  const range = ALPHA_TO_WAIST[alpha.toUpperCase()];
  if (!range) return false;
  return waist >= range[0] && waist <= range[1];
}

export function sizesCompatible(requested: string, catalogSize: string): boolean {
  const want = normalizeSizeLabel(requested);
  const have = normalizeSizeLabel(catalogSize);
  if (want === have) return true;

  const wantWi = parseWaistInseam(want);
  const haveWi = parseWaistInseam(have);
  if (wantWi && haveWi) {
    return wantWi.waist === haveWi.waist && wantWi.inseam === haveWi.inseam;
  }

  const wantAlpha = normalizeAlphaSize(want);
  if (wantAlpha && haveWi) {
    return alphaMatchesWaist(wantAlpha, haveWi.waist);
  }

  const haveAlpha = normalizeAlphaSize(have);
  if (wantAlpha && haveAlpha) return wantAlpha === haveAlpha;

  return have.toLowerCase().includes(want.toLowerCase());
}
