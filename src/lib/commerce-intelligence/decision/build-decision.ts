import type { CommerceRetrievalPayload } from "../ai/retrieval-payload";
import type { CommerceIntelligenceGraph, RetailerOfferNode } from "../graph/types";
import {
  analyzeRecommendationVolatility,
  appendSnapshot,
  historicalStabilityScore,
  type DecisionSnapshot,
} from "../drift/snapshots";
import { effectiveValueScore } from "../explain/deal-quality";
import { compositeDecisionScore, scoreOfferDimensions } from "./score-offer";
import type {
  CandidateComparison,
  CounterfactualScenario,
  PurchaseDecision,
  ReasoningTraceStep,
} from "./types";

function compareToWinner(
  winner: RetailerOfferNode,
  other: RetailerOfferNode,
  winnerScore: number,
  otherScore: number,
): string {
  const parts: string[] = [];
  const priceDiff = other.price - winner.price;
  if (priceDiff > 0.5) {
    parts.push(`$${priceDiff.toFixed(2)} more expensive`);
  } else if (priceDiff < -0.5) {
    parts.push(`$${Math.abs(priceDiff).toFixed(2)} cheaper but lower composite score`);
  }
  const confDiff = (winner.confidence?.overall ?? 0) - (other.confidence?.overall ?? 0);
  if (confDiff >= 0.08) {
    parts.push(`${Math.round(confDiff * 100)} pts lower confidence`);
  }
  const scoreGap = winnerScore - otherScore;
  if (scoreGap >= 0.05) {
    parts.push(`decision score ${scoreGap.toFixed(2)} lower`);
  }
  return parts.length ? parts.join("; ") : "Close alternative — tie-breaker favored winner";
}

function buildReasoningTrace(
  graph: CommerceIntelligenceGraph,
  validated: RetailerOfferNode[],
  rejected: RetailerOfferNode[],
  uncertaintyMessages: string[],
  tieBreaker?: string,
): ReasoningTraceStep[] {
  const trace: ReasoningTraceStep[] = [];

  for (const e of graph.evidence) {
    trace.push({
      kind: "evidence_used",
      message: `${e.evidence_type} from ${e.provenance.source_type}`,
      detail: { evidence_id: e.evidence_id, weight: e.weight },
    });
  }

  for (const o of rejected) {
    trace.push({
      kind: "evidence_rejected",
      message: `Rejected ${o.retailer_name}: ${o.validation_status}`,
      detail: {
        offer_id: o.offer_id,
        confidence: o.confidence?.overall ?? 0,
      },
    });
  }

  for (const msg of uncertaintyMessages) {
    trace.push({ kind: "ambiguity", message: msg });
    trace.push({
      kind: "uncertainty_penalty",
      message: "Uncertainty reduced composite ranking weight for borderline offers",
      detail: { note: msg.slice(0, 80) },
    });
  }

  if (graph.identity_confidence.overall < 0.55) {
    trace.push({
      kind: "uncertainty_penalty",
      message: "Low identity certainty applied caution to close calls",
      detail: { identity: graph.identity_confidence.overall },
    });
  }

  if (tieBreaker) {
    trace.push({ kind: "tie_breaker", message: tieBreaker });
  }

  return trace;
}

function buildCounterfactuals(
  winner: RetailerOfferNode,
  runnerUp: RetailerOfferNode | undefined,
  graph: CommerceIntelligenceGraph,
  winnerScore: number,
  runnerScore: number,
): CounterfactualScenario[] {
  const out: CounterfactualScenario[] = [];
  if (!runnerUp) return out;

  const priceGap = runnerUp.price - winner.price;
  if (priceGap > 0) {
    const threshold = priceGap + 0.01;
    out.push({
      id: "price_shift",
      label: "Price change",
      description: `If ${winner.retailer_name} rose by $${threshold.toFixed(2)} or more, ${runnerUp.retailer_name} could become best value.`,
      wouldChangeWinner: true,
      affectedRetailer: runnerUp.retailer_name,
    });
  }

  if ((runnerUp.confidence?.overall ?? 0) > (winner.confidence?.overall ?? 0) + 0.05) {
    out.push({
      id: "confidence_flip",
      label: "Stronger match confidence",
      description: `If ${winner.retailer_name} match confidence dropped ~${Math.round(((runnerUp.confidence?.overall ?? 0) - (winner.confidence?.overall ?? 0)) * 100)} pts, ${runnerUp.retailer_name} may win on trust.`,
      wouldChangeWinner: runnerScore + 0.04 >= winnerScore,
      affectedRetailer: runnerUp.retailer_name,
    });
  }

  if (!graph.canonical.identifiers.gtin && !graph.canonical.identifiers.asin) {
    out.push({
      id: "identifier",
      label: "Identifier match",
      description:
        "A verified GTIN or ASIN match across retailers would raise identity certainty and stabilize the recommendation.",
      wouldChangeWinner: false,
    });
  }

  if (winner.freshness_tier !== "fresh" || runnerUp.freshness_tier === "fresh") {
    out.push({
      id: "freshness",
      label: "Fresher evidence",
      description: `Fresher price feed at ${winner.retailer_name} would reinforce this pick; stale data favors rechecking ${runnerUp.retailer_name}.`,
      wouldChangeWinner: winner.freshness_tier === "stale",
      affectedRetailer: winner.retailer_name,
    });
  }

  const shipW = winner.shipping_estimate ?? 0;
  const shipR = runnerUp.shipping_estimate ?? 0;
  if (shipW > shipR + 2) {
    out.push({
      id: "shipping",
      label: "Shipping cost",
      description: `If ${winner.retailer_name} shipping were $${(shipW - shipR + 1).toFixed(2)} lower, landed value would widen its lead.`,
      wouldChangeWinner: false,
      affectedRetailer: winner.retailer_name,
    });
  } else {
    out.push({
      id: "shipping",
      label: "Shipping cost",
      description: `If ${runnerUp.retailer_name} shipping beat ${winner.retailer_name} by $5+ on landed cost, the ranking could flip.`,
      wouldChangeWinner: priceGap < 5,
      affectedRetailer: runnerUp.retailer_name,
    });
  }

  return out.slice(0, 5);
}

function buildWhyThisWins(
  winner: RetailerOfferNode,
  runnerUp: RetailerOfferNode | undefined,
  dims: ReturnType<typeof scoreOfferDimensions>,
  graph: CommerceIntelligenceGraph,
  validated: RetailerOfferNode[],
): string[] {
  const bullets: string[] = [];
  bullets.push(
    `Highest decision score (${compositeDecisionScore(dims).toFixed(2)}) among validated offers.`,
  );
  bullets.push(
    `Offer confidence ${Math.round((winner.confidence?.overall ?? 0) * 100)}% with ${winner.freshness_tier} price data.`,
  );
  if (runnerUp && winner.price < runnerUp.price) {
    bullets.push(
      `Beats ${runnerUp.retailer_name} on shipped value ($${effectiveValueScore(winner).toFixed(2)} vs $${effectiveValueScore(runnerUp).toFixed(2)}).`,
    );
  }
  const storeCount = new Set(validated.map((o) => o.retailer)).size;
  bullets.push(
    `${storeCount} store${storeCount === 1 ? "" : "s"} agree on product identity (${Math.round(graph.identity_confidence.overall * 100)}%).`,
  );
  return bullets;
}

/** Deterministic purchase decision from intelligence graph. */
export function buildPurchaseDecision(
  graph: CommerceIntelligenceGraph,
  retrieval: CommerceRetrievalPayload,
  opts?: { recordSnapshot?: boolean; uncertaintyMessages?: string[] },
): PurchaseDecision | null {
  const validated = graph.offers
    .filter((o) => o.validation_status === "validated")
    .sort((a, b) => effectiveValueScore(a) - effectiveValueScore(b));

  if (!validated.length) return null;

  const rejected = graph.offers.filter((o) => o.validation_status !== "validated");
  const histStability = historicalStabilityScore(graph.canonical.canonical_id);
  const volatility = analyzeRecommendationVolatility(graph.canonical.canonical_id);

  const scored = validated.map((offer) => {
    const dimensions = scoreOfferDimensions(graph, offer, validated, histStability);
    return {
      offer,
      dimensions,
      composite: compositeDecisionScore(dimensions),
      effectiveValue: effectiveValueScore(offer),
    };
  });

  scored.sort((a, b) => {
    if (b.composite !== a.composite) return b.composite - a.composite;
    return a.effectiveValue - b.effectiveValue;
  });

  const winnerEntry = scored[0]!;
  const winner = winnerEntry.offer;
  const runnerUp = scored[1]?.offer;

  let tieBreaker: string | undefined;
  if (runnerUp && scored[1]!.composite - winnerEntry.composite < 0.03) {
    tieBreaker = `Close call — ${winner.retailer_name} won on shipping-adjusted value after composite tie (${winnerEntry.composite.toFixed(3)} vs ${scored[1]!.composite.toFixed(3)}).`;
  } else if (runnerUp) {
    tieBreaker = `${winner.retailer_name} led by ${(winnerEntry.composite - scored[1]!.composite).toFixed(2)} decision score.`;
  }

  const uncertaintyMessages =
    opts?.uncertaintyMessages ??
    retrieval.evidence_summary.filter((_, i) => i < 3);

  const trace = buildReasoningTrace(
    graph,
    validated,
    rejected,
    uncertaintyMessages,
    tieBreaker,
  );

  const candidates: CandidateComparison[] = scored.slice(0, 3).map((s, i) => ({
    offerId: s.offer.offer_id,
    retailer: s.offer.retailer,
    retailerName: s.offer.retailer_name,
    price: s.offer.price,
    effectiveValue: s.effectiveValue,
    compositeScore: s.composite,
    rank: i + 1,
    dimensions: s.dimensions,
    vsWinnerSummary:
      i === 0 ? "Selected winner" : compareToWinner(winner, s.offer, winnerEntry.composite, s.composite),
  }));

  const whyThisWins = buildWhyThisWins(winner, runnerUp, winnerEntry.dimensions, graph, validated);

  const winnerRationale =
    `${winner.retailer_name} at $${winner.price.toFixed(2)} — ` +
    `best balance of confidence, landed value, and freshness` +
    (runnerUp ? ` vs ${runnerUp.retailer_name}` : "") +
    ".";

  const counterfactuals = buildCounterfactuals(
    winner,
    runnerUp,
    graph,
    winnerEntry.composite,
    scored[1]?.composite ?? 0,
  );

  const stability = {
    volatile: volatility.volatile,
    volatilityScore: volatility.volatilityScore,
    priorWinner: volatility.priorWinner,
    winnerChangesLast7: volatility.winnerChangesLast7,
    note: volatility.note,
  };

  const decision: PurchaseDecision = {
    winnerOfferId: winner.offer_id,
    winnerRetailer: winner.retailer,
    winnerRetailerName: winner.retailer_name,
    winnerPrice: winner.price,
    compositeScore: winnerEntry.composite,
    winnerRationale,
    whyThisWins,
    candidates,
    reasoningTrace: trace,
    counterfactuals,
    stability,
  };

  if (opts?.recordSnapshot !== false) {
    const snap: DecisionSnapshot = {
      at: new Date().toISOString(),
      canonicalId: graph.canonical.canonical_id,
      winnerOfferId: decision.winnerOfferId,
      winnerRetailer: decision.winnerRetailer,
      winnerPrice: decision.winnerPrice,
      compositeScore: decision.compositeScore,
      identityConfidence: graph.identity_confidence.overall,
      validatedOfferCount: validated.length,
      priceSpreadRatio: retrieval.consensus?.price_spread_ratio ?? 0,
    };
    appendSnapshot(snap);
  }

  return decision;
}
