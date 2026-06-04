/**
 * Shared catalog quality gate (used by scrapers CLI — mirrors demo-commerce/quality).
 */
import type { DemoProduct } from "../base/types";
import {
  passesQualityThreshold,
  scoreProductQuality,
  PUBLISH_QUALITY_THRESHOLD,
} from "../../src/lib/demo-commerce/quality";

export { PUBLISH_QUALITY_THRESHOLD, scoreProductQuality };

export function passesCatalogQuality(p: DemoProduct): boolean {
  if (p.brand === "Demo Brand") return false;
  if (p.price == null || p.price <= 0) return false;
  if (/sample product|demo brand/i.test(p.title)) return false;
  return passesQualityThreshold(p);
}

export function filterCatalogQuality(products: DemoProduct[]): DemoProduct[] {
  return products
    .filter(passesCatalogQuality)
    .map((p) => {
      const s = scoreProductQuality(p);
      return {
        ...p,
        category: s.normalizedCategory,
        quality_score: s.overall,
        normalized_category: s.normalizedCategory,
        link_type: s.linkType,
      };
    });
}

export function filterPreValidation(products: DemoProduct[]): DemoProduct[] {
  return products.filter((p) => {
    if (!p.image_url?.startsWith("http")) return false;
    if (/unsplash\.com|placehold\.co/i.test(p.image_url)) return false;
    try {
      const u = new URL(p.product_url);
      if (u.pathname === "/" || u.pathname === "") return false;
    } catch {
      return false;
    }
    return true;
  });
}
