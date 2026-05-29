/**
 * Report on successfully persisted verified quotes for manual QA.
 */

import { prisma } from "../db/prisma";
import { CATALOG } from "../retailers/catalog";
import {
  extractPackCount,
  isBulkCommercialListing,
  normalizeAmazonListingPrice,
} from "../offers/amazon-normalization";
import { isPlausiblePrice } from "../offers/offer-quality";
import { getFlagshipCatalogIds } from "./flagship-catalog";

const VERIFIED_SOURCES = ["scraped", "connector_api", "daily_index", "nightly_index"];

export interface PersistedQuoteRow {
  catalogId: string;
  title: string;
  brand: string;
  category: string;
  catalogBasePrice: number;
  retailerId: string;
  storeTitle: string | null;
  priceUsd: number;
  unitPriceUsd: number;
  source: string;
  matchConfidence: number;
  productUrl: string;
  fetchedAt: string;
  expiresAt: string;
  packCount: number;
  priceRatio: number;
  plausibleVsCatalog: boolean;
  bulkSuspicion: boolean;
  normalizationNote?: string;
}

export interface PersistedProductsReport {
  generatedAt: string;
  activeVerifiedQuotes: number;
  uniqueProducts: number;
  byCategory: Record<string, { products: number; quotes: number }>;
  byRetailer: Record<string, number>;
  suspiciousQuotes: PersistedQuoteRow[];
  products: Array<{
    catalogId: string;
    title: string;
    category: string;
    quoteCount: number;
    retailers: string[];
    minPrice: number;
    maxPrice: number;
    quotes: PersistedQuoteRow[];
  }>;
  flagshipPersisted: number;
  rejectionSummary?: {
    byReason: Record<string, number>;
    amazonPersistPct?: number;
  };
}

function catalogItemFor(catalogId: string) {
  return CATALOG.find((c) => c.id === catalogId);
}

export async function computePersistedProductsReport(options: {
  flagshipOnly?: boolean;
} = {}): Promise<PersistedProductsReport> {
  const now = new Date();
  const flagshipSet = new Set(getFlagshipCatalogIds());

  const rows = await prisma.priceQuote.findMany({
    where: {
      source: { in: VERIFIED_SOURCES },
      expiresAt: { gt: now },
    },
    include: {
      product: {
        select: {
          catalogId: true,
          title: true,
          brand: true,
          category: true,
          basePriceUsd: true,
          sizeLabel: true,
        },
      },
    },
    orderBy: [{ productId: "asc" }, { priceUsd: "asc" }],
  });

  const filtered =
    options.flagshipOnly ?
      rows.filter((r) => flagshipSet.has(r.product.catalogId))
    : rows;

  const quoteRows: PersistedQuoteRow[] = [];
  const byCategory: Record<string, { products: number; quotes: number }> = {};
  const byRetailer: Record<string, number> = {};
  const productMap = new Map<
    string,
    {
      catalogId: string;
      title: string;
      category: string;
      quotes: PersistedQuoteRow[];
    }
  >();

  for (const row of filtered) {
    const catalogId = row.product.catalogId;
    const catalog = catalogItemFor(catalogId);
    const base = row.product.basePriceUsd ?? catalog?.basePrice ?? 0;
    const storeTitle = row.storeTitle ?? row.product.title;
    const packCount = extractPackCount(storeTitle, catalog?.size ?? row.product.sizeLabel ?? undefined);
    const ratio = base > 0 ? row.priceUsd / base : 0;
    const bulkSuspicion =
      row.retailerId === "amazon" &&
      catalog ?
        isBulkCommercialListing(storeTitle, catalog) || ratio > 2.5 || ratio < 0.35
      : ratio > 3 || ratio < 0.25;

    let normalizationNote: string | undefined;
    if (row.retailerId === "amazon" && catalog) {
      const norm = normalizeAmazonListingPrice(row.priceUsd, storeTitle, catalog);
      normalizationNote = `${norm.method} pack=${norm.packCount} accepted=${norm.accepted}`;
    }

    const q: PersistedQuoteRow = {
      catalogId,
      title: row.product.title,
      brand: row.product.brand ?? catalog?.brand ?? "",
      category: row.product.category ?? catalog?.category ?? "unknown",
      catalogBasePrice: base,
      retailerId: row.retailerId,
      storeTitle: row.storeTitle,
      priceUsd: row.priceUsd,
      unitPriceUsd: row.unitPriceUsd,
      source: row.source,
      matchConfidence: row.matchConfidence,
      productUrl: row.productUrl,
      fetchedAt: row.fetchedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      packCount,
      priceRatio: Math.round(ratio * 100) / 100,
      plausibleVsCatalog: isPlausiblePrice(row.priceUsd, base),
      bulkSuspicion,
      normalizationNote,
    };

    quoteRows.push(q);
    byRetailer[row.retailerId] = (byRetailer[row.retailerId] ?? 0) + 1;

    const cat = q.category;
    if (!byCategory[cat]) byCategory[cat] = { products: 0, quotes: 0 };
    byCategory[cat]!.quotes += 1;

    let bucket = productMap.get(catalogId);
    if (!bucket) {
      bucket = { catalogId, title: q.title, category: cat, quotes: [] };
      productMap.set(catalogId, bucket);
      byCategory[cat]!.products += 1;
    }
    bucket.quotes.push(q);
  }

  const metrics = await prisma.retailerQualityMetric.findMany();
  const rejectionByReason: Record<string, number> = {};
  let amazonAccepted = 0;
  let amazonRejected = 0;
  for (const m of metrics) {
    if (m.retailerId === "amazon") {
      amazonAccepted = m.offersAccepted;
      amazonRejected = m.offersRejected;
    }
  }

  const products = [...productMap.values()]
    .map((p) => ({
      catalogId: p.catalogId,
      title: p.title,
      category: p.category,
      quoteCount: p.quotes.length,
      retailers: [...new Set(p.quotes.map((q) => q.retailerId))],
      minPrice: Math.min(...p.quotes.map((q) => q.priceUsd)),
      maxPrice: Math.max(...p.quotes.map((q) => q.priceUsd)),
      quotes: p.quotes,
    }))
    .sort((a, b) => b.quoteCount - a.quoteCount);

  return {
    generatedAt: now.toISOString(),
    activeVerifiedQuotes: quoteRows.length,
    uniqueProducts: products.length,
    byCategory,
    byRetailer,
    suspiciousQuotes: quoteRows.filter((q) => q.bulkSuspicion || !q.plausibleVsCatalog),
    products,
    flagshipPersisted: quoteRows.filter((q) => flagshipSet.has(q.catalogId)).length,
    rejectionSummary: {
      byReason: rejectionByReason,
      amazonPersistPct:
        amazonAccepted + amazonRejected > 0 ?
          Math.round((amazonAccepted / (amazonAccepted + amazonRejected)) * 100)
        : undefined,
    },
  };
}

export function formatPersistedProductsMarkdown(report: PersistedProductsReport): string {
  const lines = [
    "# Persisted verified products",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Active verified quotes: **${report.activeVerifiedQuotes}**`,
    `- Unique products: **${report.uniqueProducts}**`,
    `- Flagship persisted: **${report.flagshipPersisted}**`,
    `- Suspicious bulk/ratio: **${report.suspiciousQuotes.length}**`,
    "",
    "### By category",
    "",
    "| Category | Products | Quotes |",
    "|----------|--------:|-------:|",
    ...Object.entries(report.byCategory)
      .sort((a, b) => b[1].quotes - a[1].quotes)
      .map(([cat, v]) => `| ${cat} | ${v.products} | ${v.quotes} |`),
    "",
    "### By retailer",
    "",
    ...Object.entries(report.byRetailer)
      .sort((a, b) => b[1] - a[1])
      .map(([r, n]) => `- **${r}**: ${n}`),
    "",
    "## Persisted products",
    "",
  ];

  for (const p of report.products) {
    lines.push(`### ${p.catalogId} · ${p.title}`);
    lines.push(
      `- Category: ${p.category} · Quotes: ${p.quoteCount} · Retailers: ${p.retailers.join(", ")} · $${p.minPrice.toFixed(2)}–$${p.maxPrice.toFixed(2)}`,
    );
    for (const q of p.quotes) {
      lines.push(
        `  - **${q.retailerId}** $${q.priceUsd.toFixed(2)} (ratio ${q.priceRatio}, pack ${q.packCount}, conf ${q.matchConfidence.toFixed(2)})${q.bulkSuspicion ? " ⚠️ suspicious" : ""}`,
      );
      lines.push(`    ${q.productUrl.slice(0, 90)}`);
      if (q.normalizationNote) lines.push(`    norm: ${q.normalizationNote}`);
    }
    lines.push("");
  }

  if (report.suspiciousQuotes.length) {
    lines.push("## Suspicious quotes (manual review)", "");
    for (const q of report.suspiciousQuotes) {
      lines.push(
        `- ${q.catalogId} / ${q.retailerId}: $${q.priceUsd} ratio=${q.priceRatio} plausible=${q.plausibleVsCatalog} bulk=${q.bulkSuspicion}`,
      );
    }
  }

  return lines.join("\n");
}
