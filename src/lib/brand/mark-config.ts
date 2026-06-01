/**
 * Canonical brand mark configuration — the ONLY approved import for brand URLs/SVG.
 * Raster assets are generated from public/brand/mark.svg via npm run brand:generate.
 *
 * NAV + TAB PARITY: navbar uses mark-32.png — identical bytes to the favicon PNG.
 */
import { BRAND_MARK_SVG_MD5 } from "./mark.generated";

export const BRAND_MARK_CANONICAL_PATH = "public/brand/mark.svg";
export const BRAND_MARK_CANONICAL_URL = "/brand/mark.svg";

export const BRAND_ICON_16_URL = "/brand/mark-16.png";
export const BRAND_ICON_32_URL = "/brand/mark-32.png";
export const BRAND_ICON_180_URL = "/brand/mark-180.png";
export const BRAND_ICON_512_URL = "/brand/mark-512.png";
export const BRAND_ICON_ICO_URL = "/brand/mark.ico";
export const BRAND_OG_MARK_URL = "/brand/og-mark.png";

/** Navbar + favicon — must stay the same file (mark-32.png). */
export const BRAND_NAV_ICON_URL = BRAND_ICON_32_URL;

/** House path fingerprint — audit uses this to detect duplicate marks. */
export const BRAND_HOUSE_PATH_FINGERPRINT = "M4 11.5 12 5l8 6.5V20";

export { BRAND_MARK_SVG, BRAND_MARK_SVG_MD5 } from "./mark.generated";

/** Cache-bust query for icon URLs when SVG source changes. */
export function brandAssetUrl(path: string, version?: string): string {
  const v = version ?? BRAND_MARK_SVG_MD5.slice(0, 12);
  return `${path}?v=${v}`;
}
