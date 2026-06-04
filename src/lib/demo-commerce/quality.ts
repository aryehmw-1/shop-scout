import type { DemoProduct } from "./types";
import { normalizeCategory, retailerAllowsCategory, type TopLevelCategory } from "./taxonomy";

export interface ProductQualityScore {
  overall: number;
  link: number;
  image: number;
  category: number;
  title: number;
  retailer: number;
  normalizedCategory: TopLevelCategory;
  rejectReasons: string[];
  linkType: "pdp" | "search" | "unknown";
}

const GENERIC_IMAGE_RE =
  /unsplash\.com|placehold\.co|placeholder|picsum|loremflickr|via\.placeholder/i;
const SYNTHETIC_RE = /sample product|demo brand|— compare at/i;

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function titleMatchScore(title: string, url: string): number {
  const titleTokens = tokenize(title);
  if (!titleTokens.length) return 0;
  try {
    const u = new URL(url);
    const haystack = decodeURIComponent(`${u.pathname} ${u.search}`).toLowerCase();
    const hits = titleTokens.filter((t) => haystack.includes(t)).length;
    return Math.min(1, hits / Math.min(titleTokens.length, 6));
  } catch {
    return 0;
  }
}

function classifyLink(url: string): ProductQualityScore["linkType"] {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (
      /\/dp\/|\/ip\/|\/p\/|\/product\/|\/pd\/|\/prod\//i.test(path) ||
      (path.split("/").filter(Boolean).length >= 2 && !/search|browse/.test(path))
    ) {
      if (!u.searchParams.has("q") && !u.searchParams.has("searchTerm") && !u.searchParams.has("query")) {
        return "pdp";
      }
    }
    if (
      /search|browse|\/s\?/i.test(path + u.search) ||
      u.searchParams.has("q") ||
      u.searchParams.has("searchTerm") ||
      u.searchParams.has("keyword")
    ) {
      return "search";
    }
  } catch {
    return "unknown";
  }
  return "unknown";
}

export function scoreProductQuality(p: DemoProduct): ProductQualityScore {
  const rejectReasons: string[] = [];
  const { category: normalizedCategory, confidence: categoryConfidence } = normalizeCategory(
    p.title,
    p.category,
    p.retailer,
  );

  let title = 0.85;
  if (p.title.length < 8 || p.title.length > 280) {
    title = 0.2;
    rejectReasons.push("bad_title_length");
  }
  if (SYNTHETIC_RE.test(p.title) || SYNTHETIC_RE.test(p.description ?? "")) {
    title = 0;
    rejectReasons.push("synthetic_copy");
  }
  if (/^(walmart|target|amazon|costco):\s/i.test(p.title)) {
    title -= 0.15;
  }

  let image = 0.9;
  if (!p.image_url?.startsWith("http")) {
    image = 0;
    rejectReasons.push("missing_image");
  } else if (GENERIC_IMAGE_RE.test(p.image_url)) {
    image = 0.1;
    rejectReasons.push("generic_image");
  } else if (/media-amazon|walmartimages|target\.com|scene7|costco-static|kroger/i.test(p.image_url)) {
    image = 0.95;
  } else if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(p.image_url)) {
    image = 0.75;
  }

  const linkType = classifyLink(p.product_url);
  let link = 0.5;
  const titleMatch = titleMatchScore(p.title, p.product_url);

  if (linkType === "pdp") {
    link = 0.88 + titleMatch * 0.1;
  } else if (linkType === "search") {
    link = 0.45 + titleMatch * 0.45;
    if (titleMatch < 0.35) rejectReasons.push("weak_search_match");
  } else {
    link = 0.15;
    rejectReasons.push("bad_link");
  }

  if (p.link_valid === false) {
    link = 0;
    rejectReasons.push("link_invalid");
  }

  try {
    const u = new URL(p.product_url);
    if (u.pathname === "/" || u.pathname === "") {
      link = 0;
      rejectReasons.push("homepage");
    }
    if (/google\.com\/search/i.test(p.product_url)) {
      link = 0.1;
      rejectReasons.push("google_fallback");
    }
  } catch {
    link = 0;
    rejectReasons.push("malformed_url");
  }

  let category = categoryConfidence;
  if (!retailerAllowsCategory(p.retailer, normalizedCategory)) {
    category = 0.1;
    rejectReasons.push("retailer_category_mismatch");
  }

  let retailer = 0.85;
  if (!p.retailer || !p.retailer_domain) retailer = 0.2;

  const overall =
    link * 0.35 +
    image * 0.3 +
    category * 0.15 +
    title * 0.1 +
    retailer * 0.1;

  return {
    overall: Math.round(overall * 1000) / 1000,
    link,
    image,
    category,
    title,
    retailer,
    normalizedCategory,
    rejectReasons,
    linkType,
  };
}

export const PUBLISH_QUALITY_THRESHOLD = 0.62;

export function passesQualityThreshold(
  p: DemoProduct,
  threshold = PUBLISH_QUALITY_THRESHOLD,
): boolean {
  const s = scoreProductQuality(p);
  if (s.overall < threshold) return false;
  if (s.image < 0.5) return false;
  if (s.link < 0.45) return false;
  if (s.rejectReasons.includes("retailer_category_mismatch")) return false;
  if (s.rejectReasons.includes("generic_image")) return false;
  if (s.rejectReasons.includes("synthetic_copy")) return false;
  return true;
}

export function enrichProductWithQuality(p: DemoProduct): DemoProduct & {
  quality_score: number;
  normalized_category: string;
  link_type: string;
} {
  const s = scoreProductQuality(p);
  return {
    ...p,
    category: s.normalizedCategory,
    quality_score: s.overall,
    normalized_category: s.normalizedCategory,
    link_type: s.linkType,
  };
}
