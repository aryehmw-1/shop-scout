import { normalizeEnrichmentTitle } from "@/lib/demo-commerce/amazon-enrichment/normalize";
import type { CanonicalProduct } from "@/lib/demo-commerce/canonical/types";
import type {
  CanonicalProductNode,
  CommerceIntelligenceGraph,
  EvidenceRecord,
  IngestionProvenance,
  RetailerOfferNode,
} from "./types";

function amazonProvenance(fetchedAt: string): IngestionProvenance {
  return {
    source_type: "amazon_paapi",
    source_id: "amazon-enrichment-cache",
    fetched_at: fetchedAt,
    source_reliability: 0.92,
  };
}

function offerProvenance(retailer: string, fetchedAt: string): IngestionProvenance {
  const source_type =
    retailer === "amazon" ? "amazon_paapi"
    : retailer === "walmart" ? "walmart_affiliate_api"
    : "impact_feed";
  return {
    source_type,
    source_id: `canonical-build:${retailer}`,
    fetched_at: fetchedAt,
    source_reliability: source_type === "impact_feed" ? 0.82 : 0.88,
  };
}

export function mapCanonicalProductToGraph(
  product: CanonicalProduct,
): Pick<CommerceIntelligenceGraph, "canonical" | "offers" | "evidence"> {
  const now = product.updated_at;
  const canonical: CanonicalProductNode = {
    canonical_id: product.canonical_id,
    version: 1,
    title: product.canonical_title,
    title_normalized: normalizeEnrichmentTitle(product.canonical_title, product.brand ?? undefined),
    brand: product.brand,
    brand_canonical: product.brand?.toLowerCase() ?? null,
    category: product.canonical_category,
    canonical_image: product.canonical_image,
    canonical_image_source: product.amazon_asin ? "amazon" : "feed",
    attributes: {},
    identifiers: {
      asin: product.amazon_asin,
    },
    keywords: product.normalized_keywords,
    created_at: now,
    updated_at: now,
  };

  const evidence: EvidenceRecord[] = [];
  if (product.amazon_asin) {
    evidence.push({
      evidence_id: `${product.canonical_id}-amazon-meta`,
      canonical_id: product.canonical_id,
      evidence_type: "amazon_metadata",
      provenance: amazonProvenance(now),
      payload: { asin: product.amazon_asin, image: product.canonical_image },
      weight: 0.9,
      created_at: now,
    });
  }

  const offers: RetailerOfferNode[] = product.offers.map((o) => ({
    offer_id: `${product.canonical_id}-${o.retailer}`,
    canonical_id: product.canonical_id,
    retailer: o.retailer,
    retailer_name: o.retailer_name,
    store_title: o.store_title ?? product.canonical_title,
    product_url: o.product_url,
    affiliate_url: o.product_url,
    price: o.price,
    currency: o.currency,
    was_price: o.list_price ?? null,
    availability: o.availability,
    link_type: o.link_type,
    provenance: offerProvenance(o.retailer, now),
    validation_status: "pending",
    freshness_tier: "fresh",
  }));

  return { canonical, offers, evidence };
}
