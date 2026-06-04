import { titleSimilarity } from "@/lib/demo-commerce/amazon-enrichment/similarity";
import {
  isValidRetailerOffer,
  scoreOfferConfidence,
} from "@/lib/demo-commerce/canonical/offer-validation";
import type { CanonicalProduct } from "@/lib/demo-commerce/canonical/types";
import type {
  CommerceIntelligenceGraph,
  OfferConfidenceSnapshot,
  OfferValidationStatus,
  ProductIdentityConfidence,
  RetailerOfferNode,
} from "../graph/types";
import { mapCanonicalProductToGraph } from "../graph/map-from-demo";

const SOURCE_RELIABILITY: Record<string, number> = {
  amazon_creators_api: 0.95,
  amazon_paapi: 0.92,
  impact_feed: 0.88,
  walmart_affiliate_api: 0.9,
  ebay_browse_api: 0.85,
  rakuten_feed: 0.82,
  cached_quote: 0.7,
  http_lightweight: 0.45,
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
}

function freshnessScore(fetchedAt: string): number {
  const ageH = (Date.now() - new Date(fetchedAt).getTime()) / (1000 * 60 * 60);
  if (ageH < 24) return 1;
  if (ageH < 72) return 0.75;
  if (ageH < 168) return 0.5;
  return 0.25;
}

/** Explainable offer confidence from structured signals (deterministic). */
export function computeOfferConfidence(
  canonical: CanonicalProduct,
  offer: RetailerOfferNode,
): OfferConfidenceSnapshot {
  const reasons: OfferConfidenceSnapshot["reasons"] = [];
  const titleSim = titleSimilarity(canonical.canonical_title, offer.store_title);
  const linkScore = scoreOfferConfidence({
    canonicalTitle: canonical.canonical_title,
    storeTitle: offer.store_title,
    productUrl: offer.product_url,
    linkType: offer.link_type,
    retailer: offer.retailer,
    category: canonical.canonical_category,
  });

  if (titleSim >= 0.5) {
    reasons.push({ code: "title.strong", message: "Strong title match", weight: 0.2 });
  } else if (titleSim >= 0.28) {
    reasons.push({ code: "title.weak", message: "Partial title match", weight: 0.05 });
  } else {
    reasons.push({ code: "title.mismatch", message: "Weak title alignment", weight: -0.25 });
  }

  const srcRel =
    SOURCE_RELIABILITY[offer.provenance.source_type] ?? offer.provenance.source_reliability;
  const fresh = freshnessScore(offer.provenance.fetched_at);
  const valid = isValidRetailerOffer(
    {
      retailer: offer.retailer,
      retailer_name: offer.retailer_name,
      price: offer.price,
      currency: offer.currency,
      product_url: offer.product_url,
      availability: offer.availability,
      confidence_score: linkScore,
      link_type: offer.link_type,
      store_title: offer.store_title,
    },
    canonical.canonical_title,
    canonical.canonical_category,
  );

  if (!valid) {
    reasons.push({ code: "offer.rejected", message: "Failed validation gate", weight: -0.5 });
  }

  const identity = clamp01(titleSim * 0.6 + (canonical.amazon_asin ? 0.25 : 0.1));
  const price = offer.price > 0 ? 0.85 : 0.1;
  const link = clamp01(linkScore);
  const source = clamp01(srcRel);
  const overall = clamp01(
    identity * 0.3 + link * 0.25 + price * 0.15 + fresh * 0.15 + source * 0.15,
  );

  return {
    overall: valid ? overall : Math.min(overall, 0.35),
    identity,
    price,
    link,
    freshness: fresh,
    source,
    reasons,
  };
}

/** Product-level confidence from offer consensus + identifiers. */
export function computeIdentityConfidence(
  canonical: CanonicalProduct,
  offers: RetailerOfferNode[],
): ProductIdentityConfidence {
  const reasons: ProductIdentityConfidence["reasons"] = [];
  const validOffers = offers.filter((o) => o.validation_status === "validated");

  let identifierAgreement = canonical.amazon_asin ? 0.85 : 0.4;
  if (canonical.amazon_asin) {
    reasons.push({ code: "id.asin", message: "Amazon ASIN anchor present", weight: 0.25 });
  }

  const titleScores = validOffers.map((o) =>
    titleSimilarity(canonical.canonical_title, o.store_title),
  );
  const titleConsensus =
    titleScores.length ?
      titleScores.reduce((a, b) => a + b, 0) / titleScores.length
    : 0;

  const prices = validOffers.map((o) => o.price).filter((p) => p > 0);
  let multiSource = validOffers.length >= 2 ? 0.7 : 0.35;
  if (validOffers.length >= 4) multiSource = 0.9;

  if (prices.length >= 2) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const spread = max > 0 ? (max - min) / max : 0;
    if (spread > 0.45) {
      multiSource *= 0.7;
      reasons.push({
        code: "price.divergence",
        message: "High cross-retailer price spread",
        weight: -0.15,
      });
    } else {
      reasons.push({
        code: "price.consensus",
        message: "Prices cluster across retailers",
        weight: 0.15,
      });
    }
  }

  const overall = clamp01(
    identifierAgreement * 0.25 +
      titleConsensus * 0.25 +
      0.75 * 0.15 +
      multiSource * 0.35,
  );

  return {
    overall,
    identifier_agreement: clamp01(identifierAgreement),
    title_consensus: clamp01(titleConsensus),
    brand_consistency: canonical.brand ? 0.8 : 0.5,
    attribute_consistency: 0.65,
    multi_source_agreement: clamp01(multiSource),
    reasons,
  };
}

/** Build full intelligence graph from demo canonical product (local-first). */
export function buildIntelligenceGraph(canonical: CanonicalProduct): CommerceIntelligenceGraph {
  const base = mapCanonicalProductToGraph(canonical);
  const offersWithConfidence = base.offers.map((offer) => {
    const confidence = computeOfferConfidence(canonical, offer);
    const validation_status: OfferValidationStatus =
      confidence.overall >= 0.52 && confidence.link >= 0.45 ? "validated" : "rejected";
    return { ...offer, confidence, validation_status };
  });

  const validated = offersWithConfidence.filter((o) => o.validation_status === "validated");

  return {
    version: 1,
    updated_at: new Date().toISOString(),
    canonical: base.canonical,
    identity_confidence: computeIdentityConfidence(canonical, validated),
    offers: offersWithConfidence.sort((a, b) => a.price - b.price),
    evidence: base.evidence,
  };
}
