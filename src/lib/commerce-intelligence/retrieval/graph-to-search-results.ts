import { getRetailerMeta } from "@/lib/retailers/meta";
import type { ProductOffer, ProductSearchResults } from "@/lib/types";
import type { RecommendationExplanation } from "../explain";
import { buildRecommendationExplanation, explanationToDealBullets } from "../explain";
import type { CommerceIntelligenceGraph } from "../graph/types";
import type { CommerceRetrievalPayload } from "../ai/retrieval-payload";
import { canonicalDisplayImage } from "@/lib/demo-commerce/canonical/display-image";

function offerFromGraph(
  graph: CommerceIntelligenceGraph,
  offer: CommerceIntelligenceGraph["offers"][0],
): ProductOffer {
  const meta = getRetailerMeta(offer.retailer);
  const imageUrl = canonicalDisplayImage({
    id: graph.canonical.canonical_id,
    title: graph.canonical.title,
    brand: graph.canonical.brand,
    category: graph.canonical.category,
    keywords: graph.canonical.keywords,
    imageUrl: graph.canonical.canonical_image,
  });

  return {
    id: offer.offer_id,
    title: graph.canonical.title,
    storeTitle: offer.store_title,
    brand: graph.canonical.brand ?? "",
    size: "",
    catalogId: graph.canonical.canonical_id,
    imageUrl,
    imageSource: "catalog",
    retailer: offer.retailer,
    retailerName: meta.name,
    channel: "online",
    price: offer.price,
    unitPrice: offer.price,
    unitLabel: "each",
    inStock: offer.availability === "in_stock",
    pickupAvailable: false,
    landedCost: offer.landed_cost ?? offer.price,
    productUrl: offer.product_url,
    affiliateUrl: offer.affiliate_url,
    matchConfidence: offer.confidence?.overall ?? 0,
    priceSource: offer.provenance.source_type === "impact_feed" ? "catalog_model" : "connector_api",
  };
}

/** Map intelligence graph → chat/compare ProductSearchResults (structured only). */
export function graphToProductSearchResults(
  graph: CommerceIntelligenceGraph,
  retrieval: CommerceRetrievalPayload,
  zipCode = "78701",
  prebuiltInsight?: RecommendationExplanation,
): ProductSearchResults {
  const validated = graph.offers
    .filter((o) => o.validation_status === "validated")
    .sort((a, b) => a.price - b.price);

  const insight = prebuiltInsight ?? buildRecommendationExplanation(graph, retrieval);
  const insightByOffer = new Map(insight.offerInsights.map((o) => [o.offerId, o]));
  const imageUrl = canonicalDisplayImage({
    id: graph.canonical.canonical_id,
    title: graph.canonical.title,
    brand: graph.canonical.brand,
    category: graph.canonical.category,
    keywords: graph.canonical.keywords,
    imageUrl: graph.canonical.canonical_image,
  });

  const online: ProductOffer[] = validated.map((o) => {
    const base = offerFromGraph(graph, o);
    const oi = insightByOffer.get(o.offer_id);
    const dealExplanation = oi ? explanationToDealBullets(oi, insight) : undefined;
    return {
      ...base,
      wasPrice: o.was_price ?? undefined,
      dealExplanation: dealExplanation ?
        {
          headline: dealExplanation.headline,
          bullets: dealExplanation.bullets,
          dealScore: o.confidence?.overall,
        }
      : undefined,
      retailerTrustScore: o.confidence?.source,
      matchBand:
        (o.confidence?.overall ?? 0) >= 0.72 ? "exact_verified"
        : (o.confidence?.overall ?? 0) >= 0.52 ? "likely_match"
        : "similar",
      matchDisplayLabel: oi?.trustLabel,
    };
  });
  const fromPrice = online[0]?.price;

  return {
    local: [],
    online,
    // These offers are ALREADY finalized/validated by the intelligence graph.
    // Setting estimatedOnline (even empty) marks the result as finalized so the
    // client renders `online` as-is instead of re-running prepareResultsForDisplay
    // — which would re-apply the freshness gate to offers that carry no freshness
    // timestamp and wrongly drop every result, dumping the user into the request
    // form (e.g. "Ninja Air Fryer Max XL").
    estimatedOnline: [],
    zipCode,
    compareMode: true,
    matchedProduct: {
      title: graph.canonical.title,
      brand: graph.canonical.brand ?? "",
      imageUrl,
      fromPrice,
      imageSource: "catalog",
    },
    resolvedQuery: retrieval.query,
    enrichmentPending: false,
    enrichmentCatalogId: graph.canonical.canonical_id,
    retrievalMeta: {
      tier: "verified_intelligence",
      confidence: graph.identity_confidence.overall,
      normalizationMessage:
        `Commerce intelligence graph · identity confidence ${Math.round(graph.identity_confidence.overall * 100)}%`,
      matchReason: retrieval.evidence_summary.slice(0, 3).join(" · "),
      offerQuality: validated.length >= 2 ? "verified" : "estimated",
    },
    intelligenceInsight: insight,
  };
}
