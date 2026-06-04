import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadAllGraphs } from "../graph/store";
import { analyzeCalibration, type CalibrationReport } from "./calibration";
import { buildEvalReport, type IntelligenceEvalReport } from "./metrics";
import { runGoldenSuite, type GoldenSuiteReport } from "./golden-suite";
import { appendEvalHistory } from "./history";
import { analyzeDriftAcrossCatalog, recordSnapshotsForGraphs } from "../drift/analyze";
import type { DriftReport } from "../drift/analyze";
import { evaluateRegressionGates, type RegressionGateReport } from "./regression-gates";
import { runAdversarialSuite, type AdversarialSuiteReport } from "./adversarial-cases";
import {
  evaluateRecommendationQuality,
  type RecommendationQualityReport,
} from "./recommendation-quality";
import { runIngestStressSuite, type IngestStressReport } from "./ingest-stress";
import { analyzeRecommendationUsefulness } from "../analytics/usefulness";
import type { UsefulnessReport } from "../analytics/usefulness";
import { runIntelligenceMaintenance } from "../ops/maintenance";
import { intelligenceGraphDir } from "../storage-root";

export interface FullIntelligenceEvalReport {
  evaluatedAt: string;
  metrics: IntelligenceEvalReport;
  calibration: CalibrationReport;
  golden: GoldenSuiteReport;
  drift: DriftReport;
  adversarial: AdversarialSuiteReport;
  recommendationQuality: RecommendationQualityReport;
  ingestStress: IngestStressReport;
  usefulness: UsefulnessReport;
  regressionGates: RegressionGateReport;
}

export function runFullIntelligenceEval(): FullIntelligenceEvalReport {
  const graphs = loadAllGraphs();
  const metrics = buildEvalReport(graphs);
  const calibration = analyzeCalibration(graphs);
  const golden = runGoldenSuite();
  recordSnapshotsForGraphs();
  const drift = analyzeDriftAcrossCatalog();
  const adversarial = runAdversarialSuite();
  const recommendationQuality = evaluateRecommendationQuality();
  const ingestStress = runIngestStressSuite();
  const usefulness = analyzeRecommendationUsefulness();
  const regressionGates = evaluateRegressionGates({
    calibration,
    golden,
    adversarial,
    recommendationQuality,
    ingestStress,
    strictGolden: process.env.GOLDEN_STRICT === "1",
  });

  return {
    evaluatedAt: new Date().toISOString(),
    metrics,
    calibration,
    golden,
    drift,
    adversarial,
    recommendationQuality,
    ingestStress,
    usefulness,
    regressionGates,
  };
}

export function runFullIntelligenceEvalAndSave(): FullIntelligenceEvalReport {
  const report = runFullIntelligenceEval();
  const dir = intelligenceGraphDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "eval-report.json"), JSON.stringify(report.metrics, null, 2));
  writeFileSync(join(dir, "calibration-report.json"), JSON.stringify(report.calibration, null, 2));
  writeFileSync(join(dir, "golden-suite-report.json"), JSON.stringify(report.golden, null, 2));
  writeFileSync(join(dir, "full-eval-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(dir, "drift-report.json"), JSON.stringify(report.drift, null, 2));
  writeFileSync(
    join(dir, "regression-gates.json"),
    JSON.stringify(report.regressionGates, null, 2),
  );

  writeFileSync(join(dir, "adversarial-suite-report.json"), JSON.stringify(report.adversarial, null, 2));
  writeFileSync(
    join(dir, "recommendation-quality-report.json"),
    JSON.stringify(report.recommendationQuality, null, 2),
  );
  writeFileSync(join(dir, "ingest-stress-report.json"), JSON.stringify(report.ingestStress, null, 2));
  writeFileSync(join(dir, "usefulness-report.json"), JSON.stringify(report.usefulness, null, 2));

  appendEvalHistory({
    at: report.evaluatedAt,
    calibrationScore: report.calibration.calibrationScore,
    goldenPassRate: report.golden.passRate,
    meanIdentityConfidence: report.metrics.aggregates.meanIdentityConfidence,
    falsePositiveCount: report.calibration.falsePositiveSignals.length,
    graphCount: report.metrics.graphCount,
  });

  runIntelligenceMaintenance("eval", { skipSnapshots: true });

  return report;
}
