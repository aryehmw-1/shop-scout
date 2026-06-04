"use client";

import Link from "next/link";
import type { CanonicalProduct } from "@/lib/demo-commerce/canonical/types";
import type { RecommendationExplanation } from "@/lib/commerce-intelligence/explain";
import { CompareExperience } from "@/components/CompareExperience";
import { canonicalToSearchResults } from "@/lib/demo-commerce/canonical/to-search-results";
import { ArrowLeft } from "lucide-react";

export function CanonicalCompareView({
  product,
  zipCode = "78701",
  intelligenceInsight,
}: {
  product: CanonicalProduct;
  zipCode?: string;
  intelligenceInsight?: RecommendationExplanation;
}) {
  const results = canonicalToSearchResults(product, zipCode);
  const insight = intelligenceInsight;

  return (
    <div className="space-y-6">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-2 text-sm font-semibold text-sage-700 hover:text-sage-900"
      >
        <ArrowLeft size={18} />
        All products
      </Link>

      {results.online.length === 0 ?
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-950">
          <p className="font-semibold">Store comparison temporarily unavailable</p>
          <p className="mt-1 leading-relaxed">
            We couldn’t show verified offers for this product right now. Try again later or search
            in chat for a fresh match.
          </p>
        </div>
      : (
        <CompareExperience
          results={
            insight ?
              { ...results, intelligenceInsight: insight }
            : results
          }
          searchQuery={product.canonical_title}
          layoutMode="grid"
        />
      )}
    </div>
  );
}
