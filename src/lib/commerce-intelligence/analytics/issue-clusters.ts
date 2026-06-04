import { analyzeFriction } from "./friction";
import { analyzeComparisonLearning } from "./comparison-learning";
import { analyzeTrustLearning } from "./trust-learning";
import { analyzeProductValue } from "./product-value";

export interface IssueCluster {
  id: string;
  theme: string;
  severity: "high" | "medium" | "low";
  sessionsAffected?: number;
  actions: string[];
}

export interface IssueClusterReport {
  evaluatedAt: string;
  clusters: IssueCluster[];
}

/** Operator triage — grouped themes from beta signals. */
export function buildIssueClusters(): IssueClusterReport {
  const friction = analyzeFriction();
  const comparison = analyzeComparisonLearning();
  const trust = analyzeTrustLearning();
  const value = analyzeProductValue();

  const clusters: IssueCluster[] = [];

  for (const ins of friction.insights.filter((i) => i.severity !== "low")) {
    clusters.push({
      id: ins.id,
      theme: ins.message,
      severity: ins.severity === "high" ? "high" : "medium",
      actions: [ins.metric ? `Metric: ${ins.metric}` : "See friction report in ops dashboard"],
    });
  }

  if (comparison.disagreementRate >= 0.3 && comparison.alternativeClicks >= 2) {
    clusters.push({
      id: "winner_disagreement",
      theme: "Users prefer non-winner retailers",
      severity: "medium",
      actions: comparison.insights,
    });
  }

  if (trust.abandonmentAfterShown > 0.2) {
    clusters.push({
      id: "trust_abandon",
      theme: "Trust card shown but session abandoned",
      severity: "high",
      actions: trust.honestyWordingHints,
    });
  }

  const weak = value.weakestSegments[0];
  if (weak && weak.valueScore < 0.4) {
    clusters.push({
      id: `weak_value_${weak.category}`,
      theme: `Weak value in ${weak.category}`,
      severity: "medium",
      actions: [weak.note, "Replay sessions filtered by category"],
    });
  }

  if (clusters.length === 0) {
    clusters.push({
      id: "no_clusters",
      theme: "No issue clusters above threshold",
      severity: "low",
      actions: ["Continue beta collection"],
    });
  }

  return {
    evaluatedAt: new Date().toISOString(),
    clusters: clusters.slice(0, 8),
  };
}
