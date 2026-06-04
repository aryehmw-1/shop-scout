import { loadAllGraphs } from "../graph/store";
import { graphToRetrievalPayload } from "../ai/retrieval-payload";
import { buildRecommendationExplanation } from "../explain";
import { loadSnapshots } from "../drift/snapshots";

export interface QualityDimensionScore {
  id: string;
  label: string;
  score: number;
  detail: string;
}

export interface RecommendationQualityReport {
  evaluatedAt: string;
  graphCount: number;
  overallScore: number;
  dimensions: QualityDimensionScore[];
  satisfactionProxy: number;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
}

/**
 * Heuristic quality validation — no LLM, for CI and operator review.
 */
export function evaluateRecommendationQuality(): RecommendationQualityReport {
  const graphs = loadAllGraphs();
  const dimensions: QualityDimensionScore[] = [];

  if (!graphs.length) {
    return {
      evaluatedAt: new Date().toISOString(),
      graphCount: 0,
      overallScore: 0,
      dimensions: [
        {
          id: "graphs_present",
          label: "Catalog coverage",
          score: 0,
          detail: "No intelligence graphs",
        },
      ],
      satisfactionProxy: 0,
    };
  }

  let usefulness = 0;
  let explanation = 0;
  let counterfactual = 0;
  let stability = 0;
  let trustComprehension = 0;

  for (const g of graphs) {
    const retrieval = graphToRetrievalPayload(g, g.canonical.title);
    const ex = buildRecommendationExplanation(g, retrieval, { recordDecisionSnapshot: false });
    const validated = g.offers.filter((o) => o.validation_status === "validated");

    if (ex.decision && ex.trustSummary.length >= 20) usefulness++;
    if (ex.whyRecommended.length >= 10 && ex.evidence.count > 0) explanation++;
    if ((ex.decision?.counterfactuals.length ?? 0) >= 1) counterfactual++;
    if (ex.trustSummary.length <= 220 && !ex.trustSummary.includes("undefined")) trustComprehension++;

    const snaps = loadSnapshots(g.canonical.canonical_id);
    if (snaps.length < 2 || snaps[0]!.winnerOfferId === snaps[1]!.winnerOfferId) stability++;

    if (validated.length === 0) usefulness -= 0.5;
  }

  const n = graphs.length;
  const scores = {
    usefulness: clamp01(usefulness / n),
    explanation: clamp01(explanation / n),
    counterfactual: clamp01(counterfactual / n),
    stability: clamp01(stability / n),
    trustComprehension: clamp01(trustComprehension / n),
  };

  dimensions.push(
    {
      id: "recommendation_usefulness",
      label: "Recommendation usefulness",
      score: scores.usefulness,
      detail: `${Math.round(scores.usefulness * 100)}% with decision + trust summary`,
    },
    {
      id: "explanation_usefulness",
      label: "Explanation usefulness",
      score: scores.explanation,
      detail: `${Math.round(scores.explanation * 100)}% with rationale + evidence`,
    },
    {
      id: "counterfactual_usefulness",
      label: "Counterfactual usefulness",
      score: scores.counterfactual,
      detail: `${Math.round(scores.counterfactual * 100)}% expose at least one scenario`,
    },
    {
      id: "recommendation_stability",
      label: "Recommendation stability",
      score: scores.stability,
      detail: `${Math.round(scores.stability * 100)}% stable or insufficient history`,
    },
    {
      id: "trust_summary_comprehension",
      label: "Trust summary comprehension",
      score: scores.trustComprehension,
      detail: `${Math.round(scores.trustComprehension * 100)}% concise, valid summaries`,
    },
  );

  const overallScore = clamp01(
    (scores.usefulness +
      scores.explanation +
      scores.counterfactual +
      scores.stability +
      scores.trustComprehension) /
      5,
  );

  const satisfactionProxy = clamp01(
    scores.usefulness * 0.35 +
      scores.trustComprehension * 0.25 +
      scores.stability * 0.2 +
      scores.explanation * 0.2,
  );

  return {
    evaluatedAt: new Date().toISOString(),
    graphCount: n,
    overallScore,
    dimensions,
    satisfactionProxy,
  };
}
