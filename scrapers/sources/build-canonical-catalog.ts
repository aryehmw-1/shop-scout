/**
 * Build ~50 canonical products: Amazon metadata + multi-retailer offers.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildRetailerSearchUrl } from "../../src/lib/affiliate";
import { enrichCandidate } from "../../src/lib/demo-commerce/amazon-enrichment/enrich";
import { buildDisplayTitle, normalizeEnrichmentTitle } from "../../src/lib/demo-commerce/amazon-enrichment/normalize";
import { isAmazonEnrichmentAvailable } from "../../src/lib/demo-commerce/amazon-enrichment/enrich";
import {
  CANONICAL_DEFAULT_RETAILERS,
  CANONICAL_PRODUCT_SEEDS,
  type CanonicalProductSeed,
} from "../../src/lib/demo-commerce/canonical/seeds";
import {
  filterValidOffers,
  scoreOfferConfidence,
} from "../../src/lib/demo-commerce/canonical/offer-validation";
import type { CanonicalCatalogFile, CanonicalProduct, RetailerOffer } from "../../src/lib/demo-commerce/canonical/types";
import { normalizeCategory, retailerAllowsCategory } from "../../src/lib/demo-commerce/taxonomy";
import { getRetailerMeta } from "../../src/lib/retailers/meta";
import type { RetailerId } from "../../src/lib/types";

export interface BuildCanonicalOptions {
  cacheOnly?: boolean;
  throttleMs?: number;
  maxSeeds?: number;
  minOffers?: number;
}

export interface BuildCanonicalReport {
  seeds: number;
  enriched: number;
  published: number;
  skipped: number;
  paapiConfigured: boolean;
}

function classifyLinkType(url: string): RetailerOffer["link_type"] {
  try {
    const u = new URL(url);
    if (/\/dp\/|\/gp\/product\//i.test(u.pathname)) return "pdp";
    if (/search|browse|searchTerm|keyword/i.test(u.pathname + u.search)) return "search";
  } catch {
    return "unknown";
  }
  return "unknown";
}

function buildOffersForSeed(
  seed: CanonicalProductSeed,
  enrichment: NonNullable<Awaited<ReturnType<typeof enrichCandidate>>>,
  canonicalTitle: string,
  category: string,
): RetailerOffer[] {
  const retailers = seed.retailers ?? CANONICAL_DEFAULT_RETAILERS;
  const offers: RetailerOffer[] = [];
  const searchQuery = normalizeEnrichmentTitle(seed.title, seed.brand);

  for (const retailer of retailers) {
    if (!retailerAllowsCategory(retailer, category as ReturnType<typeof normalizeCategory>["category"])) {
      continue;
    }

    const meta = getRetailerMeta(retailer);
    let productUrl: string;
    let linkType: RetailerOffer["link_type"];
    let price: number;
    let storeTitle = canonicalTitle;

    if (retailer === "amazon" && enrichment.pdpUrl) {
      productUrl = enrichment.pdpUrl;
      linkType = "pdp";
      price = enrichment.price ?? seed.referencePrice ?? 0;
      storeTitle = enrichment.amazonTitle ?? canonicalTitle;
    } else {
      productUrl = buildRetailerSearchUrl(retailer, searchQuery);
      linkType = classifyLinkType(productUrl);
      const base = enrichment.price ?? seed.referencePrice ?? 0;
      price =
        base > 0 ?
          Math.round(base * (0.96 + (retailer.length % 4) * 0.01) * 100) / 100
        : 0;
    }

    if (!productUrl || price <= 0) continue;

    const confidence = scoreOfferConfidence({
      canonicalTitle,
      storeTitle,
      productUrl,
      linkType,
      retailer,
      category,
    });

    offers.push({
      retailer,
      retailer_name: meta.name,
      price,
      currency: "USD",
      product_url: productUrl,
      availability: "in_stock",
      confidence_score: confidence,
      link_type: linkType,
      store_title: storeTitle,
    });
  }

  return offers;
}

export async function buildCanonicalCatalog(
  opts: BuildCanonicalOptions = {},
): Promise<{ file: CanonicalCatalogFile; report: BuildCanonicalReport }> {
  const paapiConfigured = isAmazonEnrichmentAvailable();
  const seeds = CANONICAL_PRODUCT_SEEDS.slice(0, opts.maxSeeds ?? CANONICAL_PRODUCT_SEEDS.length);
  const products: CanonicalProduct[] = [];
  let enriched = 0;
  let skipped = 0;

  if (!paapiConfigured && !opts.cacheOnly) {
    console.warn("[canonical] PA-API not configured — use --cache-only or set AMAZON_PA_API_*");
  }

  for (const seed of seeds) {
    const enrichment = await enrichCandidate(
      {
        id: seed.id,
        title: seed.title,
        brand: seed.brand,
        category: seed.categoryHint,
        basePrice: seed.referencePrice,
      },
      { cacheOnly: opts.cacheOnly, throttleMs: opts.throttleMs ?? 1200 },
    );

    if (!enrichment?.amazonTitle || !enrichment.imageUrl || !enrichment.pdpUrl) {
      skipped++;
      continue;
    }
    enriched++;

    const canonicalTitle = buildDisplayTitle(
      { title: seed.title, brand: seed.brand },
      enrichment.amazonTitle,
    );
    const { category } = normalizeCategory(
      canonicalTitle,
      enrichment.categoryHint ?? seed.categoryHint,
    );

    const rawOffers = buildOffersForSeed(seed, enrichment, canonicalTitle, category);
    const offers = filterValidOffers(rawOffers, canonicalTitle, category);
    const minOffers = opts.minOffers ?? 2;

    if (offers.length < minOffers) {
      skipped++;
      continue;
    }

    products.push({
      canonical_id: seed.id,
      canonical_title: canonicalTitle,
      canonical_image: enrichment.imageUrl,
      canonical_category: category,
      brand: seed.brand ?? null,
      normalized_keywords: seed.keywords,
      amazon_asin: enrichment.asin,
      updated_at: new Date().toISOString(),
      offers,
    });
  }

  const file: CanonicalCatalogFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    products,
  };

  const dataDir = join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "canonical-products.json"), JSON.stringify(file, null, 2));

  const report: BuildCanonicalReport = {
    seeds: seeds.length,
    enriched,
    published: products.length,
    skipped,
    paapiConfigured,
  };

  console.log(
    `[canonical] ${report.published}/${report.seeds} published (${report.enriched} enriched, ${report.skipped} skipped)`,
  );

  return { file, report };
}
