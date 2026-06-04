import { buildBetaLearningReport } from "../analytics/beta-learning-report";
import { assessCanonicalCatalogHealth } from "@/lib/demo-commerce/canonical/catalog-health";
import { assessRuntimeSafety } from "./runtime-safety";
import { loadPersistedInferenceMetrics } from "@/lib/ai/router/metrics-persist";
import { getInferenceMetricsSummary } from "@/lib/ai/router/instrumentation";
import type { LaunchAlert } from "./launch-alerts";
import { buildLaunchAlerts } from "./launch-alerts";
import { buildIntelligenceObservabilitySnapshot } from "./observability";

const NEG_FEEDBACK_THRESHOLD = Number(process.env.BETA_ALERT_MIN_NEGATIVE_FEEDBACK ?? "5");
const DISAGREE_RATE_THRESHOLD = Number(process.env.BETA_ALERT_DISAGREE_RATE ?? "0.35");
const ABANDON_RATE_THRESHOLD = Number(process.env.BETA_ALERT_ABANDON_RATE ?? "0.3");

/** Beta-specific alerts layered on launch alerts. */
export function buildBetaAlerts(): LaunchAlert[] {
  const alerts = buildLaunchAlerts().filter((a) => a.id !== "all_clear");
  const report = buildBetaLearningReport();
  const catalog = assessCanonicalCatalogHealth();
  const runtime = assessRuntimeSafety();

  for (const a of runtime.alerts) {
    if (!alerts.some((x) => x.id === a.id)) alerts.push(a);
  }

  if (!catalog.demoReady && !alerts.some((a) => a.id === "runtime_catalog")) {
    alerts.push({
      id: "beta_catalog_coverage",
      severity: "critical",
      message: catalog.alerts[0] ?? "Inventory below minimum product count.",
      action: "npm run demo:build-canonical",
    });
  }

  const neg = report.usefulness.outcomes.ignores + report.outcomes.regretSignals.negativeFeedback;
  if (neg >= NEG_FEEDBACK_THRESHOLD) {
    alerts.push({
      id: "beta_negative_feedback",
      severity: "critical",
      message: `Rising negative recommendation signals (${neg} combined ignores/negative feedback).`,
      action: "Review session replay and friction report",
    });
  }

  if (report.comparison.disagreementRate >= DISAGREE_RATE_THRESHOLD && report.comparison.alternativeClicks >= 3) {
    alerts.push({
      id: "beta_disagreement",
      severity: "warning",
      message: `${Math.round(report.comparison.disagreementRate * 100)}% of shop clicks bypass the recommended winner.`,
      action: "Check comparison-learning insights",
    });
  }

  if (report.outcomes.regretSignals.reversals >= 3) {
    alerts.push({
      id: "beta_reversals",
      severity: "warning",
      message: "Recommendation reversal/regret signals elevated.",
    });
  }

  if (report.friction.abandonmentRate >= ABANDON_RATE_THRESHOLD && report.friction.insights.some((i) => i.id === "abandonment")) {
    alerts.push({
      id: "beta_abandonment",
      severity: "warning",
      message: "Abnormal session abandonment — check latency and empty-result UX.",
    });
  }

  const quality = report.interpretation.metrics;
  if (quality.usefulNo > quality.usefulYes && quality.usefulNo >= 3) {
    alerts.push({
      id: "beta_usefulness",
      severity: "critical",
      message: "In-product feedback skews negative vs positive.",
    });
  }

  const metrics = loadPersistedInferenceMetrics();
  if (metrics.recommendationCalls > 50 && metrics.totalEstimatedUsd / metrics.recommendationCalls > 0.05) {
    alerts.push({
      id: "beta_cost",
      severity: "info",
      message: "Inference cost per recommendation is elevated — review router and cache.",
    });
  }

  const weak = report.productValue.weakestSegments[0];
  if (weak && weak.valueScore < 0.35) {
    alerts.push({
      id: "beta_weak_segment",
      severity: "warning",
      message: `Weakest product value in “${weak.category}” — ${weak.note}.`,
    });
  }

  const snap = buildIntelligenceObservabilitySnapshot();
  const volatileRetailers = snap.retailerVolatility.filter(
    (r) => r.pricingVolatility >= 0.55 || r.disagreementFrequency >= 0.45,
  );
  if (volatileRetailers.length >= 2) {
    alerts.push({
      id: "beta_retailer_volatility",
      severity: "warning",
      message: `Retailer volatility spike (${volatileRetailers.map((r) => r.retailer).slice(0, 3).join(", ")}) — trust copy may need freshness cues.`,
    });
  }

  const live = getInferenceMetricsSummary();
  const slow = live.recent.filter((e) => e.latencyMs >= 8000);
  if (slow.length >= 3) {
    alerts.push({
      id: "beta_latency",
      severity: "warning",
      message: "Recent inference latency regressions detected (8s+).",
      action: "Check circuit breakers and INTELLIGENCE_SAFE_MODE",
    });
  }

  if (report.usefulness.outcomes.acceptanceProxy < 0.25 && report.usefulness.engagement.recommendationsShown >= 8) {
    alerts.push({
      id: "beta_usefulness_proxy",
      severity: "warning",
      message: "Acceptance proxy is degraded — clicks/saves lag ignores.",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "beta_all_clear",
      severity: "info",
      message: "No beta alert thresholds triggered — continue collecting sessions.",
    });
  }

  return alerts;
}
