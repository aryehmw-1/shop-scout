import type { CalibrationReport } from "./calibration";
import type { GoldenSuiteReport } from "./golden-suite";
import type { AdversarialSuiteReport } from "./adversarial-cases";
import type { RecommendationQualityReport } from "./recommendation-quality";
import type { IngestStressReport } from "./ingest-stress";
import { intelligenceOpsConfig } from "../ops/config";

export interface RegressionGate {
  id: string;
  description: string;
  passed: boolean;
  detail: string;
}

export interface RegressionGateReport {
  passed: boolean;
  gates: RegressionGate[];
}

const MIN_CALIBRATION = 0.7;
const MIN_GOLDEN_PASS_RATE = 0.85;
const MIN_GOLDEN_PASS_RATE_STRICT = 1;
const MIN_QUALITY_SCORE = Number(process.env.QUALITY_MIN_SCORE ?? "0.65");

export function evaluateRegressionGates(opts: {
  calibration: CalibrationReport;
  golden: GoldenSuiteReport;
  adversarial?: AdversarialSuiteReport;
  recommendationQuality?: RecommendationQualityReport;
  ingestStress?: IngestStressReport;
  strictGolden?: boolean;
}): RegressionGateReport {
  const gates: RegressionGate[] = [];

  gates.push({
    id: "calibration_floor",
    description: "Confidence calibration score meets minimum",
    passed: opts.calibration.calibrationScore >= MIN_CALIBRATION,
    detail: `Score ${opts.calibration.calibrationScore} (min ${MIN_CALIBRATION})`,
  });

  gates.push({
    id: "no_false_positive_surge",
    description: "False positive signals below threshold",
    passed: opts.calibration.falsePositiveSignals.length <= 3,
    detail: `${opts.calibration.falsePositiveSignals.length} signal(s)`,
  });

  const minGolden = opts.strictGolden ? MIN_GOLDEN_PASS_RATE_STRICT : MIN_GOLDEN_PASS_RATE;
  gates.push({
    id: "golden_pass_rate",
    description: "Golden query suite pass rate",
    passed: opts.golden.passRate >= minGolden,
    detail: `${Math.round(opts.golden.passRate * 100)}% (min ${Math.round(minGolden * 100)}%)`,
  });

  gates.push({
    id: "hallucination_grounding",
    description: "Recommendations cite only validated retailers",
    passed: opts.golden.hallucinationResistance.retailerGroundingPass,
    detail: opts.golden.hallucinationResistance.retailerGroundingPass ?
        "All matched cases grounded"
      : "Ungrounded retailer citation detected",
  });

  const decisionCases = opts.golden.cases.filter((c) => c.matched);
  const withDecision = decisionCases.filter(
    (c) => !c.failures.some((f) => f.includes("decision")),
  );
  gates.push({
    id: "decision_present",
    description: "Matched queries produce purchase decisions",
    passed: decisionCases.length === 0 || withDecision.length === decisionCases.length,
    detail: `${withDecision.length}/${decisionCases.length} matched with decision checks`,
  });

  if (opts.recommendationQuality && opts.recommendationQuality.graphCount > 0) {
    gates.push({
      id: "recommendation_quality",
      description: "Heuristic recommendation quality score",
      passed: opts.recommendationQuality.overallScore >= MIN_QUALITY_SCORE,
      detail: `Score ${opts.recommendationQuality.overallScore} (min ${MIN_QUALITY_SCORE}) · satisfaction proxy ${opts.recommendationQuality.satisfactionProxy}`,
    });
  }

  if (opts.ingestStress && opts.ingestStress.total > 0) {
    const rate = opts.ingestStress.passed / opts.ingestStress.total;
    gates.push({
      id: "ingest_stress",
      description: "Ingest validation stress suite",
      passed: rate >= 0.85,
      detail: `${opts.ingestStress.passed}/${opts.ingestStress.total} (${Math.round(rate * 100)}%)`,
    });
  }

  if (opts.adversarial && opts.adversarial.total > 0) {
    const rate = opts.adversarial.passed / opts.adversarial.total;
    const min = intelligenceOpsConfig.adversarialMinPassRate;
    gates.push({
      id: "adversarial_suite",
      description: "Adversarial synthetic edge-case suite pass rate",
      passed: rate >= min,
      detail: `${opts.adversarial.passed}/${opts.adversarial.total} (${Math.round(rate * 100)}%, min ${Math.round(min * 100)}%)`,
    });
  }

  return {
    passed: gates.every((g) => g.passed),
    gates,
  };
}
