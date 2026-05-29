/**
 * Data quality diagnostics — price drift, image duplication, link failures.
 */

import { prisma } from "../db/prisma";
import { CATALOG } from "../retailers/catalog";
import { isGenericCatalogImage } from "../indexing/retailer-page-image";
import { isPdpProductUrl } from "../offers/url-classifier";
import {
  getFlagshipCatalogIds,
  isDeprioritizedForIndexing,
} from "../inventory/flagship-catalog";

const VERIFIED = ["scraped", "connector_api", "daily_index", "nightly_index"];

export interface PriceDriftRow {
  catalogId: string;
  title: string;
  retailerId: string;
  catalogBase: number;
  quotedPrice: number;
  driftRatio: number;
  driftPct: number;
  severity: "ok" | "warn" | "fail";
  source: string;
  expired: boolean;
}

export interface ImageDuplicateRow {
  imageUrl: string;
  productCount: number;
  catalogIds: string[];
  isGeneric: boolean;
}

export interface LinkFailureRow {
  catalogId: string;
  retailerId: string;
  productUrl: string;
  issue: "missing_url" | "search_url" | "invalid_pdp" | "generic_page";
}

export interface DataQualityReport {
  generatedAt: string;
  flagshipCount: number;
  deprioritizedCatalogCount: number;
  priceDrift: {
    rows: PriceDriftRow[];
    failCount: number;
    warnCount: number;
  };
  imageDuplicates: {
    rows: ImageDuplicateRow[];
    duplicateImageRate: number;
    genericImageRate: number;
  };
  linkFailures: {
    rows: LinkFailureRow[];
    failureRate: number;
  };
  structuredDataHints: {
    verifiedWithoutPdp: number;
    placeholderImages: number;
    lowConfidenceQuotes: number;
  };
  recommendations: string[];
}

function catalogBase(catalogId: string): number {
  return CATALOG.find((c) => c.id === catalogId)?.basePrice ?? 0;
}

function driftSeverity(ratio: number): "ok" | "warn" | "fail" {
  if (ratio < 0.45 || ratio > 2.2) return "fail";
  if (ratio < 0.55 || ratio > 1.8) return "warn";
  return "ok";
}

export async function runDataQualityAudit(): Promise<DataQualityReport> {
  const now = new Date();
  const catalogById = new Map(CATALOG.map((c) => [c.id, c]));

  const quotes = await prisma.priceQuote.findMany({
    where: { source: { in: VERIFIED } },
    include: { product: { select: { catalogId: true, title: true, category: true } } },
    orderBy: { fetchedAt: "desc" },
  });

  const priceDriftRows: PriceDriftRow[] = [];
  for (const q of quotes) {
    const base = catalogBase(q.product.catalogId);
    if (!base || base <= 0) continue;
    const ratio = q.priceUsd / base;
    const row: PriceDriftRow = {
      catalogId: q.product.catalogId,
      title: q.product.title,
      retailerId: q.retailerId,
      catalogBase: base,
      quotedPrice: q.priceUsd,
      driftRatio: Math.round(ratio * 100) / 100,
      driftPct: Math.round((ratio - 1) * 100),
      severity: driftSeverity(ratio),
      source: q.source,
      expired: q.expiresAt <= now,
    };
    priceDriftRows.push(row);
  }

  const imageByUrl = new Map<string, Set<string>>();
  for (const item of CATALOG) {
    const url = item.imageUrl?.trim();
    if (!url) continue;
    let set = imageByUrl.get(url);
    if (!set) {
      set = new Set();
      imageByUrl.set(url, set);
    }
    set.add(item.id);
  }

  const imageDuplicateRows: ImageDuplicateRow[] = [];
  let genericCatalogImages = 0;
  for (const item of CATALOG) {
    if (isGenericCatalogImage(item.imageUrl) || /unsplash\.com/i.test(item.imageUrl ?? "")) {
      genericCatalogImages += 1;
    }
  }

  for (const [imageUrl, ids] of imageByUrl) {
    if (ids.size >= 2) {
      imageDuplicateRows.push({
        imageUrl: imageUrl.slice(0, 120),
        productCount: ids.size,
        catalogIds: [...ids],
        isGeneric: isGenericCatalogImage(imageUrl) || /unsplash\.com/i.test(imageUrl),
      });
    }
  }
  imageDuplicateRows.sort((a, b) => b.productCount - a.productCount);

  const linkFailureRows: LinkFailureRow[] = [];
  for (const q of quotes) {
    const url = q.productUrl ?? "";
    if (!url) {
      linkFailureRows.push({
        catalogId: q.product.catalogId,
        retailerId: q.retailerId,
        productUrl: "",
        issue: "missing_url",
      });
      continue;
    }
    if (/explore-all|\/pages\/explore/i.test(url)) {
      linkFailureRows.push({
        catalogId: q.product.catalogId,
        retailerId: q.retailerId,
        productUrl: url.slice(0, 120),
        issue: "generic_page",
      });
    } else if (/search|\/s\?|\/browse\//i.test(url) && !isPdpProductUrl(url)) {
      linkFailureRows.push({
        catalogId: q.product.catalogId,
        retailerId: q.retailerId,
        productUrl: url.slice(0, 120),
        issue: "search_url",
      });
    } else if (!isPdpProductUrl(url)) {
      linkFailureRows.push({
        catalogId: q.product.catalogId,
        retailerId: q.retailerId,
        productUrl: url.slice(0, 120),
        issue: "invalid_pdp",
      });
    }
  }

  const verifiedWithoutPdp = linkFailureRows.filter(
    (r) => r.issue !== "missing_url",
  ).length;
  const placeholderImages = quotes.filter(
    (q) =>
      !q.imageUrl?.startsWith("https://") ||
      isGenericCatalogImage(q.imageUrl) ||
      /unsplash\.com/i.test(q.imageUrl ?? ""),
  ).length;
  const lowConfidenceQuotes = quotes.filter(
    (q) => (q.matchConfidence ?? 0) < 0.72,
  ).length;

  const deprioritizedCatalogCount = CATALOG.filter((c) =>
    isDeprioritizedForIndexing(c.category),
  ).length;

  const recommendations: string[] = [];
  if (priceDriftRows.some((r) => r.severity === "fail")) {
    recommendations.push(
      "Price drift failures detected — re-index flagship products; verify structured data extraction vs catalog basePrice.",
    );
  }
  if (imageDuplicateRows.length > 0) {
    recommendations.push(
      "Duplicate catalog images across unrelated products — replace Unsplash placeholders; rely on retailer CDN images after enrichment.",
    );
  }
  if (linkFailureRows.length > 0) {
    recommendations.push(
      "Retailer link failures — PDP enrichment must resolve productUrl before persist; search URLs should never reach consumer UI.",
    );
  }
  if (deprioritizedCatalogCount > 30) {
    recommendations.push(
      `Catalog is ${deprioritizedCatalogCount} apparel/bedding items — use INDEX_FLAGSHIP_ONLY=on until grocery flagship set is production-grade.`,
    );
  }
  if (quotes.every((q) => q.expiresAt <= now)) {
    recommendations.push(
      "All verified quotes expired — run npm run phase0:refresh -- --limit=22 immediately.",
    );
  }

  return {
    generatedAt: now.toISOString(),
    flagshipCount: getFlagshipCatalogIds().length,
    deprioritizedCatalogCount,
    priceDrift: {
      rows: priceDriftRows.slice(0, 40),
      failCount: priceDriftRows.filter((r) => r.severity === "fail").length,
      warnCount: priceDriftRows.filter((r) => r.severity === "warn").length,
    },
    imageDuplicates: {
      rows: imageDuplicateRows.slice(0, 20),
      duplicateImageRate:
        CATALOG.length > 0 ?
          Math.round((imageDuplicateRows.length / CATALOG.length) * 1000) / 10
        : 0,
      genericImageRate:
        CATALOG.length > 0 ?
          Math.round((genericCatalogImages / CATALOG.length) * 1000) / 10
        : 0,
    },
    linkFailures: {
      rows: linkFailureRows.slice(0, 30),
      failureRate:
        quotes.length > 0 ?
          Math.round((linkFailureRows.length / quotes.length) * 1000) / 10
        : 0,
    },
    structuredDataHints: {
      verifiedWithoutPdp: verifiedWithoutPdp,
      placeholderImages,
      lowConfidenceQuotes,
    },
    recommendations,
  };
}
