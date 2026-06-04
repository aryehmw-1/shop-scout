import type { CanonicalProduct } from "@/lib/demo-commerce/canonical/types";
import type { CommerceIntelligenceGraph } from "./types";

/** Project intelligence graph → legacy demo canonical shape for UI compatibility. */
export function mapGraphToDemoCanonical(graph: CommerceIntelligenceGraph): CanonicalProduct {
  const validated = graph.offers
    .filter((o) => o.validation_status === "validated")
    .sort((a, b) => a.price - b.price);

  return {
    canonical_id: graph.canonical.canonical_id,
    canonical_title: graph.canonical.title,
    canonical_image: graph.canonical.canonical_image ?? "",
    canonical_category: String(graph.canonical.category),
    brand: graph.canonical.brand,
    normalized_keywords: graph.canonical.keywords,
    amazon_asin: graph.canonical.identifiers.asin,
    updated_at: graph.updated_at,
    offers: validated.map((o) => ({
      retailer: o.retailer,
      retailer_name: o.retailer_name,
      price: o.price,
      currency: o.currency,
      product_url: o.product_url,
      availability: o.availability,
      confidence_score: o.confidence?.overall ?? 0,
      link_type: o.link_type,
      store_title: o.store_title,
    })),
  };
}
