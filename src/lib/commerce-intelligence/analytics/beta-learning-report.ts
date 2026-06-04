import { analyzeComparisonLearning } from "./comparison-learning";
import { analyzeFriction } from "./friction";
import { analyzeCategoryStrength } from "./category-strength";
import { analyzeCohortBreakdown } from "./cohort-breakdown";
import { buildIssueClusters } from "./issue-clusters";
import { analyzeSessionQuality } from "./session-quality";
import { analyzeOutcomeLearning } from "./outcome-learning";
import { analyzeProductValue } from "./product-value";
import { analyzeRetention } from "./retention";
import { analyzeTrustLearning } from "./trust-learning";
import { buildAnalyticsInterpretation } from "./interpretation";
import { analyzeRecommendationUsefulness } from "./usefulness";

export interface BetaLearningReport {
  evaluatedAt: string;
  executiveSummary: string[];
  usefulness: ReturnType<typeof analyzeRecommendationUsefulness>;
  outcomes: ReturnType<typeof analyzeOutcomeLearning>;
  friction: ReturnType<typeof analyzeFriction>;
  retention: ReturnType<typeof analyzeRetention>;
  comparison: ReturnType<typeof analyzeComparisonLearning>;
  productValue: ReturnType<typeof analyzeProductValue>;
  trust: ReturnType<typeof analyzeTrustLearning>;
  issueClusters: ReturnType<typeof buildIssueClusters>;
  categoryStrength: ReturnType<typeof analyzeCategoryStrength>;
  sessionQuality: ReturnType<typeof analyzeSessionQuality>;
  cohorts: ReturnType<typeof analyzeCohortBreakdown>;
  interpretation: ReturnType<typeof buildAnalyticsInterpretation>;
}

/** Unified beta learning snapshot for operators. */
export function buildBetaLearningReport(): BetaLearningReport {
  const usefulness = analyzeRecommendationUsefulness();
  const outcomes = analyzeOutcomeLearning();
  const friction = analyzeFriction();
  const retention = analyzeRetention();
  const comparison = analyzeComparisonLearning();
  const productValue = analyzeProductValue();
  const trust = analyzeTrustLearning();
  const issueClusters = buildIssueClusters();
  const categoryStrength = analyzeCategoryStrength();
  const sessionQuality = analyzeSessionQuality();
  const cohorts = analyzeCohortBreakdown();
  const interpretation = buildAnalyticsInterpretation();

  const executiveSummary = [
    cohorts.headline,
    retention.headline,
    categoryStrength.productFocusHeadline,
    productValue.overallHeadline,
    ...trust.honestyWordingHints.slice(0, 1),
    ...outcomes.summary.slice(0, 1),
    ...friction.insights.filter((i) => i.severity === "high").map((i) => i.message).slice(0, 1),
    ...comparison.insights.slice(0, 1),
  ].filter(Boolean);

  return {
    evaluatedAt: new Date().toISOString(),
    executiveSummary: executiveSummary.slice(0, 6),
    usefulness,
    outcomes,
    friction,
    retention,
    comparison,
    productValue,
    trust,
    issueClusters,
    categoryStrength,
    sessionQuality,
    cohorts,
    interpretation,
  };
}
