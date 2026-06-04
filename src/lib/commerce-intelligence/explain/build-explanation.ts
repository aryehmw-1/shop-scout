import { getRetailerMeta } from "@/lib/retailers/meta";
import type { CommerceRetrievalPayload } from "../ai/retrieval-payload";
import type { CommerceIntelligenceGraph, RetailerOfferNode } from "../graph/types";
import { buildPurchaseDecision } from "../decision/build-decision";
import { assessDealQuality, effectiveValueScore } from "./deal-quality";
import { buildTrustSummary } from "./build-trust-summary";
import { getAdaptiveContext } from "../workflow/analyst-pipeline";
import type {
  ConfidenceBand,
  OfferTrustInsight,
  RecommendationExplanation,
} from "./types";

const SOURCE_LABELS: Record<string, string> = {
  impact_feed: "Impact affiliate feed",
  amazon_paapi: "Amazon Product API",
  amazon_creators_api: "Amazon Creators API",
  walmart_affiliate_api: "Walmart affiliate API",
  merchant_feed: "Merchant product feed",
  cached_quote: "Cached price quote",
};

function band(score: number): ConfidenceBand {
  if (score >= 0.72) return "high";
  if (score >= 0.52) return "medium";
  return "low";
}

function bandLabel(b: ConfidenceBand): string {
  if (b === "high") return "High confidence";
  if (b === "medium") return "Moderate confidence";
  return "Low confidence";
}

function formatSource(type: string): string {
  return SOURCE_LABELS[type] ?? type.replace(/_/g, " ");
}

function detectFakeDiscounts(offers: RetailerOfferNode[]): RecommendationExplanation["fakeDiscountWarnings"] {
  const warnings: RecommendationExplanation["fakeDiscountWarnings"] = [];
  for (const o of offers) {
    if (o.was_price != null && o.was_price > o.price) {
      const discountPct = ((o.was_price - o.price) / o.was_price) * 100;
      if (discountPct >= 40) {
        warnings.push({
          retailer: o.retailer_name,
          message: `Listed “was” price is ${Math.round(discountPct)}% above current — verify the deal is real before buying.`,
        });
      } else if (discountPct >= 15) {
        warnings.push({
          retailer: o.retailer_name,
          message: `${Math.round(discountPct)}% below listed was price — cross-check other retailers in this comparison.`,
        });
      }
    }
  }
  return warnings;
}

function buildOfferInsight(
  graph: CommerceIntelligenceGraph,
  offer: RetailerOfferNode,
): OfferTrustInsight {
  const conf = offer.confidence?.overall ?? 0;
  const b = band(conf);
  const bullets: string[] = [];
  if (offer.confidence?.reasons?.length) {
    bullets.push(...offer.confidence.reasons.slice(0, 3).map((r) => r.message));
  }
  bullets.push(`Source: ${formatSource(offer.provenance.source_type)}`);
  bullets.push(`Freshness: ${offer.freshness_tier}`);
  if (offer.link_type === "pdp") bullets.push("Direct product page link");
  else if (offer.link_type === "search") bullets.push("Search landing — price may differ on PDP");

  const meta = getRetailerMeta(offer.retailer);
  const trustLabel =
    b === "high" ? `Trusted match at ${meta.name}`
    : b === "medium" ? `Likely match at ${meta.name}`
    : `Uncertain match at ${meta.name}`;

  return {
    offerId: offer.offer_id,
    retailer: offer.retailer,
    retailerName: offer.retailer_name,
    price: offer.price,
    confidence: conf,
    band: b,
    trustLabel,
    bullets,
    sourceType: offer.provenance.source_type,
    freshness: offer.freshness_tier,
  };
}

function worthWaitingFromConsensus(
  consensus: NonNullable<RecommendationExplanation["consensus"]>,
  identityOverall: number,
): RecommendationExplanation["worthWaiting"] {
  const gap = consensus.maxPrice - consensus.minPrice;
  const belowMedian = consensus.minPrice < consensus.medianPrice * 0.98;

  if (consensus.spreadRatio > 0.35 && identityOverall >= 0.55) {
    return {
      suggest: true,
      reason:
        `Prices span ${Math.round(consensus.spreadRatio * 100)}% ($${gap.toFixed(0)} gap) — ${consensus.bestRetailer} is lowest; sales may narrow the spread.`,
    };
  }
  if (consensus.spreadRatio <= 0.12 && identityOverall >= 0.6) {
    return {
      suggest: false,
      reason:
        `Prices cluster near $${consensus.medianPrice.toFixed(2)} (median) — waiting rarely beats the current spread.`,
    };
  }
  if (belowMedian && gap > 5) {
    return {
      suggest: true,
      reason: `Current best price is below the median — if you are not urgent, watch for a mid-range sale near $${consensus.medianPrice.toFixed(2)}.`,
    };
  }
  return undefined;
}

/** Deterministic explanation from intelligence graph + retrieval payload. */
export function buildRecommendationExplanation(
  graph: CommerceIntelligenceGraph,
  retrieval: CommerceRetrievalPayload,
  opts?: {
    personalizationNote?: string | null;
    recordDecisionSnapshot?: boolean;
    includeAdaptive?: boolean;
  },
): RecommendationExplanation {
  const validated = graph.offers
    .filter((o) => o.validation_status === "validated")
    .sort((a, b) => a.price - b.price);

  const prices = validated.map((o) => o.price).filter((p) => p > 0);
  const sorted = [...prices].sort((a, b) => a - b);
  const median =
    sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;

  const id = graph.identity_confidence;
  const identityBand = band(id.overall);

  const consensus =
    prices.length >= 2 ?
      {
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        medianPrice: median,
        spreadRatio: retrieval.consensus?.price_spread_ratio ?? 0,
        offerCount: validated.length,
        bestRetailer: validated[0]!.retailer_name,
        savingsVsHighest:
          Math.round((Math.max(...prices) - Math.min(...prices)) * 100) / 100,
      }
    : prices.length === 1 ?
      {
        minPrice: prices[0]!,
        maxPrice: prices[0]!,
        medianPrice: prices[0]!,
        spreadRatio: 0,
        offerCount: 1,
        bestRetailer: validated[0]!.retailer_name,
        savingsVsHighest: 0,
      }
    : undefined;

  const uncertainty: RecommendationExplanation["uncertainty"] = [];
  if (consensus && consensus.spreadRatio > 0.35) {
    uncertainty.push({
      level: "warning",
      message: `Cross-retailer prices differ by up to ${Math.round(consensus.spreadRatio * 100)}% — confirm size/model before choosing.`,
    });
  }
  if (id.overall < 0.55) {
    uncertainty.push({
      level: "warning",
      message: "Product identity is not fully confirmed across sources — treat prices as indicative.",
    });
  }
  if (validated.length < 2) {
    uncertainty.push({
      level: "info",
      message: "Only one validated retailer offer — comparison depth is limited.",
    });
  }

  const sourceTypes = [...new Set(validated.map((o) => o.provenance.source_type))];
  const fakeDiscountWarnings = detectFakeDiscounts(validated);

  const offerInsights = validated.map((o) => buildOfferInsight(graph, o));

  const best = [...validated].sort(
    (a, b) => effectiveValueScore(a) - effectiveValueScore(b),
  )[0];
  const safest = [...validated].sort(
    (a, b) => (b.confidence?.overall ?? 0) - (a.confidence?.overall ?? 0),
  )[0];
  const bestDealQuality = best ? assessDealQuality(best) : null;

  const whyParts: string[] = [];
  if (best) {
    whyParts.push(
      `**${best.retailer_name}** has the lowest validated price at **$${best.price.toFixed(2)}**.`,
    );
  }
  whyParts.push(
    `${validated.length} retailer${validated.length === 1 ? "" : "s"} agree this is the same product (identity ${Math.round(id.overall * 100)}%).`,
  );
  if (graph.evidence.length) {
    whyParts.push(`${graph.evidence.length} evidence record${graph.evidence.length === 1 ? "" : "s"} support this match.`);
  }

  const draft: RecommendationExplanation = {
    canonicalId: graph.canonical.canonical_id,
    productTitle: graph.canonical.title,
    headline:
      best ?
        `Best value: ${best.retailer_name} · ${bandLabel(band(best.confidence?.overall ?? 0))}`
      : `Evidence-backed comparison · ${bandLabel(identityBand)}`,
    whyRecommended: whyParts.join(" "),
    identity: {
      overall: id.overall,
      band: identityBand,
      breakdown: [
        {
          key: "identifiers",
          label: "Identifier agreement",
          value: id.identifier_agreement,
        },
        {
          key: "title",
          label: "Title consensus",
          value: id.title_consensus,
        },
        {
          key: "brand",
          label: "Brand consistency",
          value: id.brand_consistency,
        },
        {
          key: "multi_source",
          label: "Multi-retailer agreement",
          value: id.multi_source_agreement,
        },
      ],
      reasons: id.reasons.map((r) => r.message),
    },
    retailerAgreement: {
      validatedOfferCount: validated.length,
      retailerCount: new Set(validated.map((o) => o.retailer)).size,
      sourceTypes,
      agreementLabel:
        validated.length >= 3 ?
          "Strong multi-retailer agreement"
        : validated.length >= 2 ?
          "Two-store price consensus"
        : "Single-source offer",
    },
    evidence: {
      count: graph.evidence.length,
      summaries: retrieval.evidence_summary.slice(0, 8),
    },
    consensus,
    uncertainty,
    fakeDiscountWarnings,
    bestValue:
      best ?
        {
          retailer: best.retailer_name,
          price: best.price,
          reason: `Lowest validated price with ${Math.round((best.confidence?.overall ?? 0) * 100)}% offer confidence.`,
        }
      : undefined,
    safestPurchase:
      safest ?
        {
          retailer: safest.retailer_name,
          reason: `Highest offer confidence (${Math.round((safest.confidence?.overall ?? 0) * 100)}%) and ${formatSource(safest.provenance.source_type)}.`,
        }
      : undefined,
    worthWaiting:
      consensus ? worthWaitingFromConsensus(consensus, id.overall) : undefined,
    offerInsights,
    trustSummary: "",
    personalizationNote: opts?.personalizationNote ?? null,
    dealQualityLabel: bestDealQuality?.label,
  };

  const uncertaintyMsgs = draft.uncertainty.map((u) => u.message);
  draft.decision =
    buildPurchaseDecision(graph, retrieval, {
      recordSnapshot: opts?.recordDecisionSnapshot !== false,
      uncertaintyMessages: uncertaintyMsgs,
    }) ?? undefined;

  if (draft.decision) {
    draft.headline = `Recommended: ${draft.decision.winnerRetailerName}`;
    if (draft.decision.stability.volatile && draft.decision.stability.note) {
      draft.uncertainty.unshift({
        level: "warning",
        message: draft.decision.stability.note,
      });
    }
  }

  draft.trustSummary = buildTrustSummary(draft);
  if (opts?.includeAdaptive !== false) {
    draft.adaptive = getAdaptiveContext(graph);
  }
  return draft;
}

export function explanationToDealBullets(
  insight: OfferTrustInsight,
  explanation: RecommendationExplanation,
): { headline: string; bullets: string[] } {
  const bullets = [...insight.bullets];
  if (
    explanation.bestValue?.retailer === insight.retailerName &&
    explanation.consensus
  ) {
    bullets.unshift(
      `Lowest price in this comparison — save up to $${explanation.consensus.savingsVsHighest.toFixed(2)} vs highest store.`,
    );
  }
  if (explanation.safestPurchase?.retailer === insight.retailerName) {
    bullets.unshift("Highest-confidence offer in this comparison.");
  }
  return { headline: insight.trustLabel, bullets };
}
