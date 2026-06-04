/**
 * High-density catalog from in-app CATALOG × retailers.
 * Uses store search URLs (pre-filled product intent) + catalog images/titles.
 * Prefer adapter/PA-API ingest when available; this fills volume for demos.
 */
import { buildRetailerSearchUrl } from "../../src/lib/affiliate";
import { imageForProduct } from "../../src/lib/catalog-images";
import { getRetailerListing } from "../../src/lib/retailers/listings";
import type { RetailerId } from "../../src/lib/types";
import type { DemoProduct } from "../base/types";
import { PRIORITY_RETAILERS, ADAPTER_RETAILERS } from "../config";
import { getDomainForRetailer } from "../utils/retailer-domains";
import { makeProductId } from "../utils/storage";
import { normalizeCategory, retailerAllowsCategory } from "../../src/lib/demo-commerce/taxonomy";

import { listUniqueRetailers } from "../utils/retailer-domains";

const GENERIC_IMAGE_RE =
  /unsplash\.com|placehold\.co|placeholder|picsum|loremflickr/i;

const MATRIX_RETAILERS = [
  ...new Set([
    ...ADAPTER_RETAILERS,
    ...PRIORITY_RETAILERS,
    ...listUniqueRetailers()
      .slice(0, 35)
      .map((r) => r.retailer),
  ]),
];

function isSearchListingUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (path === "/" || path === "") return false;
    return (
      /search|browse|s\?|catalog|shop\/|gp\/bestsellers/i.test(path + u.search) ||
      u.searchParams.has("q") ||
      u.searchParams.has("query") ||
      u.searchParams.has("searchTerm") ||
      u.searchParams.has("keyword")
    );
  } catch {
    return false;
  }
}

export function buildCatalogMatrix(): DemoProduct[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const catalog = require("../../src/lib/retailers/catalog").CATALOG as Array<{
    id: string;
    title: string;
    brand: string;
    size: string;
    category: string;
    keywords: string[];
    imageUrl?: string;
    basePrice: number;
  }>;
  if (!catalog?.length) {
    console.warn("[catalog-matrix] CATALOG empty — check export");
    return [];
  }

  const products: DemoProduct[] = [];
  const now = new Date().toISOString();
  let errors = 0;

  for (const item of catalog) {
    const { category: topCategory } = normalizeCategory(item.title, item.category);
    for (const retailer of MATRIX_RETAILERS) {
      const domain = getDomainForRetailer(retailer);
      if (!domain) continue;
      if (!retailerAllowsCategory(retailer, topCategory)) continue;

      try {
        const listing = getRetailerListing(
          {
            id: item.id,
            title: item.title,
            brand: item.brand,
            size: item.size,
            category: item.category,
            keywords: item.keywords ?? [],
            imageUrl: item.imageUrl,
          },
          retailer as RetailerId,
          "online",
        );

        const searchUrl = buildRetailerSearchUrl(retailer as RetailerId, item.title);
        if (!isSearchListingUrl(searchUrl)) continue;

        const imageCandidate =
          item.imageUrl ||
          listing.imageUrl ||
          imageForProduct({
            id: item.id,
            title: item.title,
            brand: item.brand,
            category: item.category,
            keywords: item.keywords ?? [],
          });
        if (!imageCandidate || GENERIC_IMAGE_RE.test(imageCandidate)) continue;

        const price =
          Math.round(item.basePrice * (0.92 + (retailer.length % 7) * 0.03) * 100) / 100;

        products.push({
          id: makeProductId(retailer, `${item.id}-${searchUrl}`),
          retailer,
          retailer_domain: domain,
          title: listing.storeTitle,
          brand: item.brand,
          category: topCategory,
          price,
          currency: "USD",
          image_url: imageCandidate,
          product_url: searchUrl,
          availability: "in_stock",
          description: `${item.title} at ${retailer}.`,
          scraped_at: now,
          link_valid: true,
          image_valid: true,
        });
      } catch {
        errors++;
      }
    }
  }

  if (!products.length && errors) {
    console.warn(`[catalog-matrix] ${errors} retailer/item errors (affiliate switch)`);
  }
  return products;
}
