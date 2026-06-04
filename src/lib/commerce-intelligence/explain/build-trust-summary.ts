import { getExperimentVariant, isExperimentEnabled } from "../experiments/variants";
import type { RecommendationExplanation } from "./types";

/** One calm line for primary UX — no raw metrics overload. */
export function buildTrustSummary(insight: RecommendationExplanation): string {
  const idPct = Math.round(insight.identity.overall * 100);
  const stores = insight.retailerAgreement.retailerCount;
  const evidence = insight.evidence.count;
  const variant =
    isExperimentEnabled() ?
      getExperimentVariant("trust_summary_style", insight.canonicalId)
    : "control";
  const framing =
    isExperimentEnabled() ?
      getExperimentVariant("trust_framing", insight.canonicalId)
    : "control";

  if (insight.decision) {
    const d = insight.decision;
    const volatile = d.stability.volatile ? " Prices may shift — recheck before you buy." : "";
    const reason = d.whyThisWins[0] ?? d.winnerRationale;
    if (variant === "a") {
      return `Best pick: ${d.winnerRetailerName} · $${d.winnerPrice.toFixed(2)}.${volatile}`;
    }
    if (framing === "b") {
      return `${d.winnerRetailerName} at $${d.winnerPrice.toFixed(2)} — ${reason} (our best match today).${volatile}`;
    }
    return `We recommend ${d.winnerRetailerName} at $${d.winnerPrice.toFixed(2)} — ${reason}${volatile}`;
  }

  if (insight.uncertainty.some((u) => u.level === "warning")) {
    return `Verified match (${idPct}% identity) across ${stores} stores — some uncertainty remains; see details.`;
  }

  if (insight.consensus && insight.consensus.savingsVsHighest > 1) {
    if (variant === "a") {
      return `Verified across ${stores} stores — save up to $${insight.consensus.savingsVsHighest.toFixed(0)}.`;
    }
    return `Same product confirmed across ${stores} stores · save up to $${insight.consensus.savingsVsHighest.toFixed(0)} · ${evidence} evidence points.`;
  }

  if (variant === "a") {
    return `Verified match across ${stores} store${stores === 1 ? "" : "s"}. Tap for details.`;
  }

  return `Evidence-backed match (${idPct}% identity) · ${stores} retailer${stores === 1 ? "" : "s"} · ${evidence} source${evidence === 1 ? "" : "s"}.`;
}
