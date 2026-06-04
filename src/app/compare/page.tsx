import type { Metadata } from "next";
import { Suspense } from "react";
import { ComparePageClient } from "./ComparePageClient";
import { APP_NAME } from "@/lib/constants";
import { canonicalToSearchResults } from "@/lib/demo-commerce/canonical/to-search-results";
import {
  getCanonicalProductById,
} from "@/lib/demo-commerce/canonical/store";
import {
  filterPublicCanonicalProduct,
} from "@/lib/retailers/public-retailers";
import type { ProductSearchResults, ShoppingIntent } from "@/lib/types";
import { searchService } from "@/lib/search/search-service";
import { inventoryService, demoInventoryFallbackEnabled } from "@/lib/inventory/inventory-service";

export const metadata: Metadata = {
  title: "Compare pricing",
  description:
    "Compare pricing across Amazon, Costco, Kroger, Walmart, Target, and more. See savings, trust scores, and price history in one view.",
  openGraph: {
    title: `Compare pricing · ${APP_NAME}`,
    description:
      "Side-by-side compare pricing with persisted pricing, savings context, and retailer trust signals.",
  },
};

type ComparePageProps = {
  searchParams?: Promise<{
    q?: string;
    product?: string;
    catalog?: string;
    zip?: string;
  }>;
};

async function loadInitialCompareResults({
  query,
  productId,
  zip,
}: {
  query: string;
  productId: string;
  zip: string;
}): Promise<ProductSearchResults | null> {
  if (productId) {
    const persisted = await inventoryService.getProductResultsById(decodeURIComponent(productId));
    if (persisted?.online.length) return persisted;
    if (!demoInventoryFallbackEnabled()) return null;

    const product = getCanonicalProductById(decodeURIComponent(productId));
    if (!product) return null;
    const publicProduct = filterPublicCanonicalProduct(product);
    return publicProduct.offers.length >= 2 ?
        canonicalToSearchResults(publicProduct, zip)
      : null;
  }

  if (!query || query.length < 2) return null;

  const intent: ShoppingIntent = { query, zipCode: zip };
  return searchService.search(intent, {
    mode: "compare",
    skipHistory: true,
  });
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = (await searchParams) ?? {};
  const productId = params.product ?? params.catalog ?? "";
  const query = params.q?.trim() ?? "";
  const zip = params.zip?.trim() || "78701";
  const initialResults = await loadInitialCompareResults({ query, productId, zip });
  const initialError =
    (query || productId) && !initialResults ?
      "No matching product in inventory. Try another name or browse inventory."
    : null;

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-stone-500">
          Loading compare…
        </div>
      }
    >
      <ComparePageClient
        initialQuery={query}
        initialProductId={productId}
        initialResults={initialResults}
        initialError={initialError}
      />
    </Suspense>
  );
}
