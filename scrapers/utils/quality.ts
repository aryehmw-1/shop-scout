/** @deprecated Import from ./catalog-quality — re-export for existing imports. */
export {
  filterCatalogQuality,
  filterPreValidation,
  passesCatalogQuality,
  scoreProductQuality,
  PUBLISH_QUALITY_THRESHOLD,
} from "./catalog-quality";

import type { DemoProduct } from "../base/types";

const PLACEHOLDER_RE =
  /sample product|demo brand|placeholder|lorem ipsum|test product|xxx/i;

const HOMEPAGE_PATH_RE = /^\/(?:$|index|home|shop)?$/i;

export function isHomepageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (HOMEPAGE_PATH_RE.test(u.pathname)) return true;
    const path = u.pathname.toLowerCase();
    if (path.split("/").filter(Boolean).length <= 1 && !u.search) return true;
    if (
      /search|browse|\/s\?|catalog|bestsellers|\/shop\//i.test(path + u.search) ||
      u.searchParams.has("q") ||
      u.searchParams.has("query") ||
      u.searchParams.has("searchTerm")
    ) {
      return false;
    }
  } catch {
    return true;
  }
  return false;
}

export function isPlaceholderProduct(p: DemoProduct): boolean {
  if (PLACEHOLDER_RE.test(p.title)) return true;
  if (p.description && PLACEHOLDER_RE.test(p.description)) return true;
  if (p.product_url === `https://www.${p.retailer_domain}/`) return true;
  if (p.image_url?.includes("placehold.co")) return true;
  if (p.brand === "Demo Brand") return true;
  return false;
}
