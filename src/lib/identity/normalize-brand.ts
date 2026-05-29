import { KNOWN_BRANDS } from "../shopping/brands";

const BRAND_ALIASES: Record<string, string> = {
  ...KNOWN_BRANDS,
  "levi strauss": "Levi's",
  "levi strauss & co": "Levi's",
  levis: "Levi's",
  levi: "Levi's",
  "levi's": "Levi's",
  "the north face": "The North Face",
  northface: "The North Face",
  "polo ralph lauren": "Polo Ralph Lauren",
  ralphlauren: "Polo Ralph Lauren",
  "tommy hilfiger": "Tommy Hilfiger",
  tommyhilfiger: "Tommy Hilfiger",
  "calvin klein": "Calvin Klein",
  calvinklein: "Calvin Klein",
  "h & m": "H&M",
  hm: "H&M",
  "h&m": "H&M",
  "old navy": "Old Navy",
  oldnavy: "Old Navy",
  "under armour": "Under Armour",
  underarmour: "Under Armour",
  "dick's sporting goods": "Dick's Sporting Goods",
  dicks: "Dick's Sporting Goods",
  "bass pro shops": "Bass Pro Shops",
  basspro: "Bass Pro Shops",
  "cabela's": "Cabela's",
  cabelas: "Cabela's",
};

function normalizeBrandKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map retailer / user brand strings to a single canonical display name.
 */
export function canonicalizeBrand(raw: string | undefined | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const trimmed = raw.trim();
  const key = normalizeBrandKey(trimmed);
  if (!key) return undefined;

  if (BRAND_ALIASES[key]) return BRAND_ALIASES[key];

  for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
    if (key === alias || key.startsWith(`${alias} `) || key.endsWith(` ${alias}`)) {
      return canonical;
    }
  }

  if (/^[a-z0-9\s&'.-]+$/i.test(trimmed) && trimmed.length <= 48) {
    return trimmed
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ")
      .replace(/\bAnd\b/g, "and")
      .replace(/\bH&m\b/i, "H&M");
  }

  return trimmed;
}

export function brandsMatch(
  a: string | undefined,
  b: string | undefined,
): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const ca = canonicalizeBrand(a);
  const cb = canonicalizeBrand(b);
  if (!ca || !cb) return false;
  return normalizeBrandKey(ca) === normalizeBrandKey(cb);
}
