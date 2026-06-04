import { analyzeSessionSuccess } from "./session-success";
import { buildBetaLearningReport } from "./beta-learning-report";
import { assessCanonicalCatalogHealth } from "@/lib/demo-commerce/canonical/catalog-health";

export type OperatorVerdict = "on_track" | "needs_attention" | "insufficient_data";

export interface OperatorBullet {
  priority: "action" | "watch" | "positive";
  text: string;
}

export interface BetaOperatorSummary {
  evaluatedAt: string;
  verdict: OperatorVerdict;
  bullets: OperatorBullet[];
  catalog: ReturnType<typeof assessCanonicalCatalogHealth>;
  sections: {
    strongestCategory: string;
    weakestTrust: string;
    retention: string;
    disagreement: string;
    onboarding: string;
    usefulness: string;
  };
}

/** Concise, actionable beta report — not metric dumps. */
export function buildBetaOperatorSummary(): BetaOperatorSummary {
  const report = buildBetaLearningReport();
  const success = analyzeSessionSuccess();
  const catalog = assessCanonicalCatalogHealth();
  const bullets: OperatorBullet[] = [];

  if (!catalog.demoReady) {
    bullets.push({
      priority: "action",
      text: catalog.alerts[0] ?? "Fix canonical catalog before expanding beta traffic.",
    });
  }

  const strong = report.categoryStrength.strongestVerticals[0];
  const weak = report.categoryStrength.weakestTrust[0] ?? report.productValue.weakestSegments[0];
  const usefulPct =
    report.interpretation.metrics.usefulYes + report.interpretation.metrics.usefulNo > 0 ?
      Math.round(
        (report.interpretation.metrics.usefulYes /
          (report.interpretation.metrics.usefulYes + report.interpretation.metrics.usefulNo)) *
          100,
      )
    : null;

  if (strong) {
    bullets.push({
      priority: "positive",
      text: `Strongest vertical: ${strong.category} — ${strong.focusNote}`,
    });
  }
  if (weak) {
    bullets.push({
      priority: "watch",
      text: `Weakest trust/value: ${weak.category} — review match and trust copy before scaling that category.`,
    });
  }

  bullets.push({
    priority: report.retention.returnRate >= 0.15 ? "positive" : "watch",
    text: report.retention.headline,
  });

  if (report.comparison.disagreementRate >= 0.3 && report.comparison.alternativeClicks >= 2) {
    bullets.push({
      priority: "watch",
      text: report.comparison.insights[0] ?? "Users often prefer non-winner stores.",
    });
  }

  const onboardRatio =
    report.sessionQuality.onboardingCompleted + report.sessionQuality.onboardingSkipped > 0 ?
      report.sessionQuality.onboardingCompleted /
      (report.sessionQuality.onboardingCompleted + report.sessionQuality.onboardingSkipped)
    : null;
  if (onboardRatio != null && onboardRatio < 0.4 && report.sessionQuality.onboardingSkipped >= 3) {
    bullets.push({
      priority: "watch",
      text: "Onboarding skipped more than completed — shorten first screen or defer onboarding.",
    });
  }

  if (usefulPct != null && usefulPct < 50 && report.interpretation.metrics.usefulNo >= 3) {
    bullets.push({
      priority: "action",
      text: `Only ${usefulPct}% marked recommendations useful — replay negative sessions before trust copy changes.`,
    });
  } else if (usefulPct != null && usefulPct >= 70) {
    bullets.push({
      priority: "positive",
      text: `${usefulPct}% recent in-product feedback is positive.`,
    });
  }

  const highFriction = report.friction.insights.find((i) => i.severity === "high");
  if (highFriction) {
    bullets.push({ priority: "action", text: highFriction.message });
  }

  if (success.successfulPatterns[0]?.id !== "collect") {
    bullets.push({
      priority: "positive",
      text: success.successfulPatterns[0]!.message,
    });
  }

  const sessions = report.sessionQuality.successful + report.sessionQuality.abandoned;
  let verdict: OperatorVerdict = "insufficient_data";
  if (sessions >= 8 || report.interpretation.metrics.sessionCount >= 8) {
    verdict =
      bullets.some((b) => b.priority === "action") || !catalog.demoReady ?
        "needs_attention"
      : "on_track";
  }

  return {
    evaluatedAt: new Date().toISOString(),
    verdict,
    bullets: bullets.slice(0, 8),
    catalog,
    sections: {
      strongestCategory: strong ? `${strong.category} (${strong.strength})` : "—",
      weakestTrust: weak ? `${weak.category}` : "—",
      retention: report.retention.headline,
      disagreement:
        report.comparison.alternativeClicks > 0 ?
          `${Math.round(report.comparison.disagreementRate * 100)}% clicks on non-winner`
        : "Insufficient click data",
      onboarding:
        onboardRatio != null ?
          `${Math.round(onboardRatio * 100)}% completed onboarding`
        : "No onboarding events yet",
      usefulness:
        usefulPct != null ? `${usefulPct}% useful feedback` : report.interpretation.headline,
    },
  };
}
