export const APP_NAME = "Shop Scout";
export const APP_TAGLINE = "Scout deals. Save more.";
export const APP_DESCRIPTION =
  "Compare online prices on groceries, fashion, shoes, home, sports, and more across major retailers. Paste a link or describe what you need — shipping estimates use your ZIP.";

/** Internal catalog default when user has not set a ZIP yet. */
export const CATALOG_DEFAULT_ZIP = "78701";

export function hasUserZip(zip?: string): boolean {
  return /^\d{5}$/.test(zip?.trim() ?? "");
}

export function resolveCatalogZip(zip?: string): string {
  return hasUserZip(zip) ? zip!.trim() : CATALOG_DEFAULT_ZIP;
}

/** Primary nav label for /chat — one action, not two buttons */
export const COMPARE_NAV_LABEL = "Compare prices";
