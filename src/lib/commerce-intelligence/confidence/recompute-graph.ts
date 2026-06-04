import type { CanonicalProduct } from "@/lib/demo-commerce/canonical/types";
import type { CommerceIntelligenceGraph, OfferValidationStatus } from "../graph/types";
import { computeIdentityConfidence, computeOfferConfidence } from "./compute";

/** Recompute confidence + validation on an existing graph without losing provenance/evidence. */
export function recomputeExistingGraph(
  graph: CommerceIntelligenceGraph,
): CommerceIntelligenceGraph {
  const canonicalAdapter: CanonicalProduct = {
    canonical_id: graph.canonical.canonical_id,
    canonical_title: graph.canonical.title,
    canonical_image: graph.canonical.canonical_image ?? "",
    canonical_category: graph.canonical.category,
    brand: graph.canonical.brand,
    normalized_keywords: graph.canonical.keywords,
    amazon_asin: graph.canonical.identifiers.asin,
    updated_at: graph.updated_at,
    offers: graph.offers.map((o) => ({
      retailer: o.retailer,
      retailer_name: o.retailer_name,
      price: o.price,
      currency: o.currency,
      product_url: o.product_url,
      availability: o.availability,
      confidence_score: o.confidence?.overall ?? 0.5,
      link_type: o.link_type,
      store_title: o.store_title,
    })),
  };

  const offersWithConfidence = graph.offers.map((offer) => {
    const confidence = computeOfferConfidence(canonicalAdapter, offer);
    const validation_status: OfferValidationStatus =
      confidence.overall >= 0.52 && confidence.link >= 0.45 ? "validated" : "rejected";
    return { ...offer, confidence, validation_status };
  });

  const validated = offersWithConfidence.filter((o) => o.validation_status === "validated");

  return {
    ...graph,
    version: 1,
    updated_at: new Date().toISOString(),
    identity_confidence: computeIdentityConfidence(canonicalAdapter, validated),
    offers: offersWithConfidence.sort((a, b) => a.price - b.price),
    evidence: graph.evidence,
  };
}
