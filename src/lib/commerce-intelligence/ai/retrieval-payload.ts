import type { CommerceIntelligenceGraph } from "../graph/types";

/**
 * Evidence-grounded payload for LLM reasoning — NOT raw HTML.
 * Retrieval → ranking → reasoning → generation should consume this shape.
 */
export interface CommerceRetrievalPayload {
  query: string;
  intent?: {
    zip_code?: string;
    category?: string;
    budget_max?: number;
  };
  canonical: {
    id: string;
    title: string;
    brand: string | null;
    category: string;
    image_url: string | null;
    identifiers: Record<string, string | undefined>;
    identity_confidence: number;
    identity_reasons: string[];
  };
  offers: Array<{
    retailer: string;
    price: number;
    landed_cost?: number | null;
    availability: string;
    url: string;
    confidence: number;
    confidence_reasons: string[];
    source: string;
    freshness: string;
  }>;
  consensus?: {
    min_price: number;
    max_price: number;
    median_price: number;
    offer_count: number;
    price_spread_ratio: number;
  };
  evidence_summary: string[];
  /** Instructions for the model — keep deterministic policy outside the model when possible */
  policy: {
    must_cite_confidence: boolean;
    min_offer_confidence_to_recommend: number;
    disallow_uncited_claims: boolean;
  };
}

export function graphToRetrievalPayload(
  graph: CommerceIntelligenceGraph,
  query: string,
): CommerceRetrievalPayload {
  const validated = graph.offers.filter((o) => o.validation_status === "validated");
  const prices = validated.map((o) => o.price).filter((p) => p > 0);
  const sorted = [...prices].sort((a, b) => a - b);
  const median =
    sorted.length ?
      sorted[Math.floor(sorted.length / 2)]!
    : 0;

  const evidence_summary = [
    ...graph.identity_confidence.reasons.map((r) => r.message),
    ...graph.evidence.map((e) => `${e.evidence_type} (${e.provenance.source_type})`),
  ].slice(0, 12);

  return {
    query,
    canonical: {
      id: graph.canonical.canonical_id,
      title: graph.canonical.title,
      brand: graph.canonical.brand,
      category: String(graph.canonical.category),
      image_url: graph.canonical.canonical_image,
      identifiers: graph.canonical.identifiers as Record<string, string | undefined>,
      identity_confidence: graph.identity_confidence.overall,
      identity_reasons: graph.identity_confidence.reasons.map((r) => r.message),
    },
    offers: validated.map((o) => ({
      retailer: o.retailer_name,
      price: o.price,
      landed_cost: o.landed_cost ?? o.price,
      availability: o.availability,
      url: o.affiliate_url,
      confidence: o.confidence?.overall ?? 0,
      confidence_reasons: (o.confidence?.reasons ?? []).map((r) => r.message),
      source: o.provenance.source_type,
      freshness: o.freshness_tier,
    })),
    consensus:
      prices.length >= 2 ?
        {
          min_price: Math.min(...prices),
          max_price: Math.max(...prices),
          median_price: median,
          offer_count: validated.length,
          price_spread_ratio:
            Math.max(...prices) > 0 ?
              (Math.max(...prices) - Math.min(...prices)) / Math.max(...prices)
            : 0,
        }
      : undefined,
    evidence_summary,
    policy: {
      must_cite_confidence: true,
      min_offer_confidence_to_recommend: 0.55,
      disallow_uncited_claims: true,
    },
  };
}
