import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import { CanonicalCompareView } from "@/components/demo/CanonicalCompareView";
import { getCanonicalProductById, hasCanonicalCatalog } from "@/lib/demo-commerce/canonical/store";
import {
  filterPublicCanonicalProduct,
  isPublicRetailer,
} from "@/lib/retailers/public-retailers";
import { buildIntelligenceGraph } from "@/lib/commerce-intelligence";
import { graphToRetrievalPayload } from "@/lib/commerce-intelligence/ai/retrieval-payload";
import { buildRecommendationExplanation } from "@/lib/commerce-intelligence/explain";
import { loadGraph } from "@/lib/commerce-intelligence/graph/store";
import { getDemoProductById } from "@/lib/demo-commerce/store";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";
import { buildDemoOutboundUrl } from "@/lib/demo-commerce/outbound";
import { formatPrice } from "@/lib/utils/format";
import type { RetailerId } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DemoProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);

  if (hasCanonicalCatalog()) {
    const canonical = getCanonicalProductById(decoded);
    if (!canonical) notFound();
    const publicProduct = filterPublicCanonicalProduct(canonical);
    if (publicProduct.offers.length < 2) notFound();
    const intelligence = loadGraph(decoded) ?? buildIntelligenceGraph(canonical);
    const retrieval = graphToRetrievalPayload(intelligence, publicProduct.canonical_title);
    const intelligenceInsight = buildRecommendationExplanation(intelligence, retrieval, {
      recordDecisionSnapshot: false,
    });

    return (
      <AppShell>
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-12">
            <CanonicalCompareView
              product={publicProduct}
              intelligenceInsight={intelligenceInsight}
            />
          </div>
          <Footer />
        </main>
      </AppShell>
    );
  }

  const product = getDemoProductById(decoded);
  if (!product || !isPublicRetailer(product.retailer as RetailerId)) notFound();

  const outbound = buildDemoOutboundUrl(product);

  return (
    <AppShell>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-12">
          <Link
            href="/demo"
            className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-sage-700 hover:text-sage-900"
          >
            <ArrowLeft size={18} />
            Back to catalog
          </Link>
          <div className="grid gap-8 md:grid-cols-2">
            <div className="rounded-2xl border border-cream-200 bg-white p-6">
              {product.image_url && (
                <ProductImage
                  src={product.image_url}
                  alt={product.title}
                  className="mx-auto aspect-square max-h-80 w-full object-contain"
                />
              )}
            </div>
            <div className="space-y-4">
              <h1 className="font-homy text-2xl font-bold text-ink-900">{product.title}</h1>
              {product.price != null && (
                <p className="text-3xl font-bold">{formatPrice(product.price)}</p>
              )}
              <a
                href={outbound}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-sage-700 px-6 py-3 font-semibold text-white"
              >
                View at {product.retailer}
                <ExternalLink size={18} />
              </a>
            </div>
          </div>
        </div>
        <Footer />
      </main>
    </AppShell>
  );
}
