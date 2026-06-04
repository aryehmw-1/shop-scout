import { assessCanonicalCatalogHealth } from "@/lib/demo-commerce/canonical/catalog-health";
import { getCircuitBreakerStatus } from "@/lib/ai/router/resilience";
import { buildIntelligenceObservabilitySnapshot } from "./observability";
import type { LaunchAlert } from "./launch-alerts";

export interface RuntimeSafetyReport {
  evaluatedAt: string;
  ok: boolean;
  checks: {
    catalogDemoReady: boolean;
    graphIndexed: boolean;
    lowConfidenceShare: number;
    openCircuits: string[];
    abandonmentSpike: boolean;
  };
  alerts: LaunchAlert[];
}

/** Lightweight guards for empty/stale/degraded beta runtime. */
export function assessRuntimeSafety(): RuntimeSafetyReport {
  const alerts: LaunchAlert[] = [];
  const catalog = assessCanonicalCatalogHealth();
  const snap = buildIntelligenceObservabilitySnapshot();
  const circuits = getCircuitBreakerStatus();

  if (!catalog.demoReady) {
    alerts.push({
      id: "runtime_catalog",
      severity: "critical",
      message: catalog.alerts[0] ?? "Product inventory not ready.",
      action: "npm run demo:build-canonical",
    });
  } else if (catalog.status === "stale") {
    alerts.push({
      id: "runtime_catalog_stale",
      severity: "warning",
      message: catalog.alerts.find((a) => a.includes("updated")) ?? "Catalog may be stale.",
    });
  } else if (catalog.status === "partial") {
    alerts.push({
      id: "runtime_catalog_partial",
      severity: "warning",
      message: catalog.alerts[0] ?? "Partial catalog coverage.",
    });
  }

  const graphIndexed = snap.graphCount > 0;
  if (!graphIndexed) {
    alerts.push({
      id: "runtime_no_graph",
      severity: "warning",
      message: "No intelligence graphs indexed — recommendations may be empty.",
      action: "npm run demo:impact-ingest",
    });
  }

  const total = snap.confidenceDistribution.high + snap.confidenceDistribution.medium + snap.confidenceDistribution.low;
  const lowShare = total ? snap.confidenceDistribution.low / total : 0;
  if (lowShare > 0.45 && total >= 5) {
    alerts.push({
      id: "runtime_low_confidence",
      severity: "warning",
      message: `${Math.round(lowShare * 100)}% of graph nodes are low-confidence — expect more uncertainty copy.`,
    });
  }

  const openCircuits = Object.entries(circuits)
    .filter(([, s]) => s.open)
    .map(([k]) => k);
  if (openCircuits.length > 0) {
    alerts.push({
      id: "runtime_circuit_open",
      severity: "warning",
      message: `Provider circuit open: ${openCircuits.join(", ")} — chat may fall back.`,
    });
  }

  const abandon = snap.productAnalytics.last24h.session_abandon ?? 0;
  const shown = snap.productAnalytics.last24h.recommendation_shown ?? 0;
  const abandonmentSpike = shown >= 5 && abandon / shown > 0.35;
  if (abandonmentSpike) {
    alerts.push({
      id: "runtime_abandon_spike",
      severity: "warning",
      message: "24h abandonment spike vs recommendations shown.",
      action: "Review /debug/intelligence-sessions",
    });
  }

  return {
    evaluatedAt: new Date().toISOString(),
    ok: alerts.filter((a) => a.severity === "critical").length === 0,
    checks: {
      catalogDemoReady: catalog.demoReady,
      graphIndexed,
      lowConfidenceShare: Math.round(lowShare * 1000) / 1000,
      openCircuits,
      abandonmentSpike,
    },
    alerts,
  };
}
