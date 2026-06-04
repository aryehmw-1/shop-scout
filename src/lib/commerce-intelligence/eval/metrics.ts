import { titleSimilarity } from "@/lib/demo-commerce/amazon-enrichment/similarity";
import type { CommerceIntelligenceGraph } from "../graph/types";
import { graphToRetrievalPayload } from "../ai/retrieval-payload";
import { buildRecommendationExplanation } from "../explain";

export interface GraphEvalScores {
  canonicalId: string;
  title: string;
  identityConfidence: number;
  validatedOfferCount: number;
  rejectedOfferCount: number;
  evidenceCount: number;
  priceSpreadRatio: number;
  hasConsensus: boolean;
  explanationUsefulness: number;
  offerValidationRate: number;
  titleConsensusAvg: number;
}

export interface IntelligenceEvalReport {
  evaluatedAt: string;
  graphCount: number;
  publishedCount: number;
  aggregates: {
    meanIdentityConfidence: number;
    meanValidatedOffers: number;
    meanEvidenceCount: number;
    meanPriceSpread: number;
    meanExplanationScore: number;
    meanOfferValidationRate: number;
    graphsWithMultiRetailer: number;
    graphsWithHighIdentity: number;
    graphsWithWarnings: number;
  };
  graphs: GraphEvalScores[];
  calibrationNotes: string[];
}

export function scoreGraph(graph: CommerceIntelligenceGraph): GraphEvalScores {
  const validated = graph.offers.filter((o) => o.validation_status === "validated");
  const rejected = graph.offers.filter((o) => o.validation_status === "rejected");
  const prices = validated.map((o) => o.price).filter((p) => p > 0);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const spread = max > 0 ? (max - min) / max : 0;

  const retrieval = graphToRetrievalPayload(graph, graph.canonical.title);
  const explanation = buildRecommendationExplanation(graph, retrieval);

  const titleScores = validated.map((o) =>
    titleSimilarity(graph.canonical.title_normalized, o.store_title),
  );
  const titleConsensusAvg =
    titleScores.length ?
      titleScores.reduce((a, b) => a + b, 0) / titleScores.length
    : 0;

  let explanationUsefulness = 0.4;
  if (explanation.trustSummary.length > 20) explanationUsefulness += 0.1;
  if (explanation.whyRecommended.length > 40) explanationUsefulness += 0.1;
  if (explanation.consensus && explanation.consensus.offerCount >= 2) explanationUsefulness += 0.15;
  if (explanation.evidence.count > 0) explanationUsefulness += 0.1;
  if (explanation.bestValue && explanation.safestPurchase) explanationUsefulness += 0.1;
  if (explanation.uncertainty.length) explanationUsefulness += 0.1;
  explanationUsefulness = Math.min(1, explanationUsefulness);

  const totalOffers = graph.offers.length || 1;

  return {
    canonicalId: graph.canonical.canonical_id,
    title: graph.canonical.title,
    identityConfidence: graph.identity_confidence.overall,
    validatedOfferCount: validated.length,
    rejectedOfferCount: rejected.length,
    evidenceCount: graph.evidence.length,
    priceSpreadRatio: spread,
    hasConsensus: validated.length >= 2,
    explanationUsefulness,
    offerValidationRate: validated.length / totalOffers,
    titleConsensusAvg,
  };
}

export function buildEvalReport(graphs: CommerceIntelligenceGraph[]): IntelligenceEvalReport {
  const graphsScored = graphs.map(scoreGraph);
  const n = graphsScored.length || 1;

  const mean = (fn: (g: GraphEvalScores) => number) =>
    graphsScored.reduce((s, g) => s + fn(g), 0) / n;

  const published = graphsScored.filter(
    (g) => g.validatedOfferCount >= 2 && g.identityConfidence >= 0.45,
  );

  const calibrationNotes: string[] = [];
  const lowIdentity = graphsScored.filter((g) => g.identityConfidence < 0.5).length;
  if (lowIdentity > 0) {
    calibrationNotes.push(
      `${lowIdentity} graph(s) below 50% identity confidence — review identifier coverage.`,
    );
  }
  const highSpread = graphsScored.filter((g) => g.priceSpreadRatio > 0.35).length;
  if (highSpread > 0) {
    calibrationNotes.push(
      `${highSpread} graph(s) with >35% price spread — ensure uncertainty is surfaced in UX.`,
    );
  }
  const lowValidation = graphsScored.filter((g) => g.offerValidationRate < 0.5).length;
  if (lowValidation > 0) {
    calibrationNotes.push(
      `${lowValidation} graph(s) reject majority of offers — check title/category gates.`,
    );
  }

  return {
    evaluatedAt: new Date().toISOString(),
    graphCount: graphs.length,
    publishedCount: published.length,
    aggregates: {
      meanIdentityConfidence: mean((g) => g.identityConfidence),
      meanValidatedOffers: mean((g) => g.validatedOfferCount),
      meanEvidenceCount: mean((g) => g.evidenceCount),
      meanPriceSpread: mean((g) => g.priceSpreadRatio),
      meanExplanationScore: mean((g) => g.explanationUsefulness),
      meanOfferValidationRate: mean((g) => g.offerValidationRate),
      graphsWithMultiRetailer: graphsScored.filter((g) => g.validatedOfferCount >= 2).length,
      graphsWithHighIdentity: graphsScored.filter((g) => g.identityConfidence >= 0.65).length,
      graphsWithWarnings: graphsScored.filter((g) => g.priceSpreadRatio > 0.35).length,
    },
    graphs: graphsScored,
    calibrationNotes,
  };
}
