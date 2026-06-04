import { graphToRetrievalPayload } from "../ai/retrieval-payload";
import { buildRecommendationExplanation } from "../explain";
import { detectMarketSignals } from "../market/awareness";
import { forecastRecommendationStability } from "../forecast/stability";
import { buildRetailerIntelligenceProfiles } from "../reputation/retailer-intelligence";
import type { CommerceIntelligenceGraph } from "../graph/types";
import type { RecommendationExplanation } from "../explain/types";
import type { ReasoningTraceStep } from "../decision/types";

export interface AnalystPipelineResult {
  graph: CommerceIntelligenceGraph;
  retrieval: ReturnType<typeof graphToRetrievalPayload>;
  explanation: RecommendationExplanation;
  workflowTrace: ReasoningTraceStep[];
  investigationSummary: string;
}

export function summarizeInvestigation(trace: ReasoningTraceStep[]): string {
  const evidence = trace.filter((t) => t.kind === "evidence_used").length;
  const rejected = trace.filter((t) => t.kind === "evidence_rejected").length;
  const warnings = trace.filter((t) => t.kind === "ambiguity").length;
  const parts = [`${evidence} evidence step(s) applied`];
  if (rejected) parts.push(`${rejected} offer(s) rejected`);
  if (warnings) parts.push(`${warnings} market/ambiguity signal(s)`);
  return parts.join(" · ");
}

/**
 * Deterministic multi-step analyst investigation (no LLM).
 * Order: evidence → identity → candidates → trust → decision → counterfactuals → uncertainty.
 */
export function runAnalystPipeline(
  graph: CommerceIntelligenceGraph,
  query: string,
  opts?: { personalizationNote?: string | null; recordSnapshot?: boolean },
): AnalystPipelineResult {
  const workflowTrace: ReasoningTraceStep[] = [];
  const retrieval = graphToRetrievalPayload(graph, query);

  workflowTrace.push({
    kind: "evidence_used",
    message: `Gathered ${graph.evidence.length} evidence records from graph`,
    detail: { count: graph.evidence.length },
  });

  workflowTrace.push({
    kind: "evidence_used",
    message: `Identity confidence ${Math.round(graph.identity_confidence.overall * 100)}%`,
    detail: { identifier_agreement: graph.identity_confidence.identifier_agreement },
  });

  const validated = graph.offers.filter((o) => o.validation_status === "validated");
  const rejected = graph.offers.filter((o) => o.validation_status !== "validated");
  for (const o of rejected.slice(0, 5)) {
    workflowTrace.push({
      kind: "evidence_rejected",
      message: `Rejected offer ${o.retailer_name}`,
      detail: { status: o.validation_status },
    });
  }

  const marketSignals = detectMarketSignals(graph);
  for (const s of marketSignals) {
    workflowTrace.push({
      kind: s.severity === "warning" ? "ambiguity" : "evidence_used",
      message: s.message,
    });
  }

  const explanation = buildRecommendationExplanation(graph, retrieval, {
    personalizationNote: opts?.personalizationNote,
    recordDecisionSnapshot: opts?.recordSnapshot,
  });

  if (explanation.decision) {
    workflowTrace.push({
      kind: "tie_breaker",
      message: explanation.decision.winnerRationale,
    });
    for (const c of explanation.decision.counterfactuals.slice(0, 2)) {
      workflowTrace.push({
        kind: "evidence_used",
        message: `Counterfactual: ${c.label}`,
      });
    }
  }

  const forecast = forecastRecommendationStability(graph);
  workflowTrace.push({
    kind: "uncertainty_penalty",
    message: forecast.summary,
    detail: { half_life_hours: forecast.recommendationHalfLifeHours },
  });

  explanation.decision?.reasoningTrace.push(...workflowTrace);

  const investigationSummary = summarizeInvestigation(workflowTrace);
  explanation.investigationSummary = investigationSummary;

  return { graph, retrieval, explanation, workflowTrace, investigationSummary };
}

export function getAdaptiveContext(graph: CommerceIntelligenceGraph) {
  const retailers = new Set(
    graph.offers.filter((o) => o.validation_status === "validated").map((o) => o.retailer),
  );
  return {
    marketSignals: detectMarketSignals(graph),
    stabilityForecast: forecastRecommendationStability(graph),
    retailerIntelligence: buildRetailerIntelligenceProfiles().filter((r) =>
      retailers.has(r.retailer),
    ),
  };
}
