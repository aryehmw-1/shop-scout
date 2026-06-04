import { loadAnalyticsEvents } from "./events";

export interface FrictionInsight {
  id: string;
  severity: "high" | "medium" | "low";
  message: string;
  metric?: string;
}

export interface FrictionReport {
  evaluatedAt: string;
  abandonmentRate: number;
  analystModeAfterTrustRate: number;
  onboardingReopenRate: number;
  uncertaintyHeavyCategories: string[];
  insights: FrictionInsight[];
}

/** Where users struggle or need more clarity — operator-readable. */
export function analyzeFriction(): FrictionReport {
  const events = loadAnalyticsEvents().events;
  const insights: FrictionInsight[] = [];

  const shown = events.filter((e) => e.event === "recommendation_shown").length;
  const abandon = events.filter((e) => e.event === "session_abandon").length;
  const trustOpen = events.filter((e) => e.event === "trust_details_open").length;
  const analystOpen = events.filter((e) => e.event === "analyst_mode_open").length;
  const onboardingSkip = events.filter((e) => e.event === "onboarding_dismissed_early").length;
  const onboardingDone = events.filter((e) => e.event === "onboarding_completed").length;
  const onboardingReopen = events.filter((e) => e.event === "onboarding_reopened").length;
  const noMatch = events.filter((e) => e.event === "recommendation_no_match").length;
  const ignore = events.filter((e) => e.event === "recommendation_ignore").length;

  const sessions = new Set(events.map((e) => e.sessionId).filter(Boolean)).size;
  const abandonmentRate = sessions ? abandon / sessions : 0;

  const analystModeAfterTrustRate =
    trustOpen > 0 ? analystOpen / trustOpen : 0;

  const onboardingTotal = onboardingSkip + onboardingDone + onboardingReopen;
  const onboardingReopenRate = onboardingTotal ? onboardingReopen / onboardingTotal : 0;

  const categoryUncertainty = new Map<string, number>();
  for (const e of events) {
    if (e.event === "query_category" && e.queryCategory) {
      const cat = e.queryCategory;
      const nm = events.filter(
        (x) => x.queryCategory === cat && x.event === "recommendation_no_match",
      ).length;
      categoryUncertainty.set(cat, nm);
    }
  }
  const uncertaintyHeavyCategories = [...categoryUncertainty.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);

  if (abandonmentRate > 0.25 && abandon >= 3) {
    insights.push({
      id: "abandonment",
      severity: "high",
      message: "Users abandon sessions before engaging — check empty results, latency, or confusing first reply.",
      metric: `${Math.round(abandonmentRate * 100)}% abandon rate`,
    });
  }

  if (shown > 0 && analystOpen / shown > 0.3) {
    insights.push({
      id: "detail_friction",
      severity: "medium",
      message:
        "Many users open “More detail” — default recommendation may not feel complete enough.",
      metric: `${Math.round((analystOpen / shown) * 100)}% detail rate`,
    });
  }

  if (onboardingSkip > onboardingDone && onboardingSkip >= 3) {
    insights.push({
      id: "onboarding_skip",
      severity: "low",
      message: "Onboarding dismissed early more than completed — consider shorter first screen.",
    });
  }

  if (onboardingReopen >= 2) {
    insights.push({
      id: "onboarding_reopen",
      severity: "low",
      message: "Users reopen “How it works” — good sign they want clarity before trusting picks.",
    });
  }

  if (noMatch >= 5) {
    insights.push({
      id: "no_match",
      severity: "medium",
      message: "Frequent no-match queries — friction at search-to-recommendation handoff.",
      metric: `${noMatch} no-match events`,
    });
  }

  if (ignore >= 3 && shown > 0 && ignore / shown > 0.2) {
    insights.push({
      id: "trust_drop",
      severity: "high",
      message: "Negative usefulness feedback is elevated relative to recommendations shown.",
    });
  }

  for (const cat of uncertaintyHeavyCategories.slice(0, 3)) {
    insights.push({
      id: `uncertainty_${cat}`,
      severity: "medium",
      message: `Category “${cat}” often fails to match — uncertainty and trust drop likely here.`,
    });
  }

  if (shown > 0 && trustOpen / shown > 0.25 && analystOpen / shown < 0.1) {
    insights.push({
      id: "hesitation_trust_only",
      severity: "medium",
      message:
        "Users open “Why this pick” but rarely “More detail” — hesitation may be about trust wording, not missing depth.",
      metric: `${Math.round((trustOpen / shown) * 100)}% expand trust`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "low_friction",
      severity: "low",
      message: "No major friction patterns detected yet — keep collecting beta sessions.",
    });
  }

  return {
    evaluatedAt: new Date().toISOString(),
    abandonmentRate: Math.round(abandonmentRate * 1000) / 1000,
    analystModeAfterTrustRate: Math.round(analystModeAfterTrustRate * 1000) / 1000,
    onboardingReopenRate: Math.round(onboardingReopenRate * 1000) / 1000,
    uncertaintyHeavyCategories,
    insights,
  };
}
