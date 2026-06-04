export type {
  CanonicalProductNode,
  CommerceIntelligenceGraph,
  EvidenceRecord,
  IngestionProvenance,
  IngestionSourceType,
  OfferConfidenceSnapshot,
  ProductIdentityConfidence,
  RetailerOfferNode,
} from "./graph/types";

export { mapCanonicalProductToGraph } from "./graph/map-from-demo";
export {
  buildIntelligenceGraph,
  computeIdentityConfidence,
  computeOfferConfidence,
} from "./confidence/compute";
export {
  graphToRetrievalPayload,
  type CommerceRetrievalPayload,
} from "./ai/retrieval-payload";
export { summarizeRetrievalPayload } from "./ai/summarize-retrieval-payload";
export {
  buildRecommendationExplanation,
  explanationToDealBullets,
  type RecommendationExplanation,
} from "./explain";
export { runIntelligenceEval, runIntelligenceEvalAndSave } from "./eval/run-eval";
export { runFullIntelligenceEval, runFullIntelligenceEvalAndSave } from "./eval/run-full-eval";
export { analyzeCalibration, type CalibrationReport } from "./eval/calibration";
export { runGoldenSuite, type GoldenSuiteReport } from "./eval/golden-suite";
export { buildEvalReport, type IntelligenceEvalReport } from "./eval/metrics";
export {
  resolveIntelligencePreferences,
  type IntelligencePreferences,
  type PurchasePriority,
} from "./personalization/preferences";
export { buildPurchaseDecision } from "./decision/build-decision";
export type { PurchaseDecision } from "./decision/types";
export { analyzeDriftAcrossCatalog } from "./drift/analyze";
export { evaluateRegressionGates } from "./eval/regression-gates";
export { recordTrustMemoryEvent, trustMemoryRankingBoost } from "./trust-memory/store";
export { tryIntelligenceSearch, type IntelligenceSearchResult } from "./retrieval/intelligence-search";
export { resolveIntelligenceForQuery, shouldUseIntelligenceMatch } from "./retrieval/resolve-for-query";
export {
  loadGraph,
  loadPublishedGraphs,
  listGraphIds,
  saveGraph,
  syncPublishedGraphsToDemoCatalog,
} from "./graph/store";
export { runAnalystPipeline, getAdaptiveContext } from "./workflow/analyst-pipeline";
export { buildRetailerIntelligenceProfiles } from "./reputation/retailer-intelligence";
export { detectMarketSignals } from "./market/awareness";
export { forecastRecommendationStability } from "./forecast/stability";
export { runAdversarialSuite } from "./eval/adversarial-cases";
export {
  intelligenceRecommend,
  intelligenceTrustSummary,
  intelligenceDriftReport,
} from "./service/intelligence-api";
