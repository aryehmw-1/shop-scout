import { loadAnalyticsEvents } from "./events";

export interface RetentionCohort {
  label: string;
  sessionCount: number;
  avgTrustOpens: number;
  avgClicks: number;
  returnSignal: number;
}

export interface RetentionReport {
  evaluatedAt: string;
  uniqueSessions: number;
  returnSessions: number;
  returnRate: number;
  repeatQuerySessions: number;
  categoryLoyalty: Array<{ category: string; repeatQueries: number }>;
  cohorts: { retained: RetentionCohort; notRetained: RetentionCohort };
  whyThisPickEngagementTrend: {
    last7dRate: number;
    prior7dRate: number;
    trend: "up" | "down" | "flat";
  };
  headline: string;
}

/** Beta retention — do users come back and re-engage with trust affordances? */
export function analyzeRetention(): RetentionReport {
  const events = loadAnalyticsEvents().events;
  const now = Date.now();
  const day = 86400000;

  const bySession = new Map<
    string,
    { at: number[]; categories: string[]; trustOpens: number; clicks: number; returned: boolean }
  >();

  for (const e of events) {
    if (!e.sessionId) continue;
    const s = bySession.get(e.sessionId) ?? {
      at: [],
      categories: [],
      trustOpens: 0,
      clicks: 0,
      returned: false,
    };
    s.at.push(new Date(e.at).getTime());
    if (e.event === "query_category" && e.queryCategory) s.categories.push(e.queryCategory);
    if (e.event === "trust_details_open") s.trustOpens++;
    if (e.event === "offer_click") s.clicks++;
    if (e.event === "session_return") s.returned = true;
    bySession.set(e.sessionId, s);
  }

  let returnSessions = 0;
  let repeatQuerySessions = 0;
  const categoryCounts = new Map<string, number>();

  for (const [, s] of bySession) {
    const sorted = [...new Set(s.categories)];
    if (sorted.length >= 2) repeatQuerySessions++;
    if (sorted.length >= 1) {
      const top = sorted[0]!;
      categoryCounts.set(top, (categoryCounts.get(top) ?? 0) + 1);
    }
    const span = Math.max(...s.at) - Math.min(...s.at);
    if (span > 60000 && s.trustOpens > 0) returnSessions++;
  }

  const explicitReturns = events.filter((e) => e.event === "session_return").length;
  returnSessions = Math.max(returnSessions, explicitReturns);

  const uniqueSessions = bySession.size;
  const returnRate = uniqueSessions ? returnSessions / uniqueSessions : 0;

  const last7Trust = events.filter(
    (e) =>
      e.event === "trust_details_open" &&
      now - new Date(e.at).getTime() < 7 * day,
  ).length;
  const last7Shown = events.filter(
    (e) =>
      e.event === "recommendation_shown" &&
      now - new Date(e.at).getTime() < 7 * day,
  ).length;
  const prior7Trust = events.filter(
    (e) =>
      e.event === "trust_details_open" &&
      now - new Date(e.at).getTime() >= 7 * day &&
      now - new Date(e.at).getTime() < 14 * day,
  ).length;
  const prior7Shown = events.filter(
    (e) =>
      e.event === "recommendation_shown" &&
      now - new Date(e.at).getTime() >= 7 * day &&
      now - new Date(e.at).getTime() < 14 * day,
  ).length;

  const last7dRate = last7Shown ? last7Trust / last7Shown : 0;
  const prior7dRate = prior7Shown ? prior7Trust / prior7Shown : 0;
  const trend: RetentionReport["whyThisPickEngagementTrend"]["trend"] =
    last7dRate > prior7dRate + 0.05 ? "up"
    : last7dRate < prior7dRate - 0.05 ? "down"
    : "flat";

  const retainedSessions: typeof bySession extends Map<string, infer V> ? V[] : never = [];
  const notRetainedSessions: typeof retainedSessions = [];
  for (const [, s] of bySession) {
    const span = s.at.length ? Math.max(...s.at) - Math.min(...s.at) : 0;
    const retained =
      s.returned || (span > 120000 && (s.trustOpens > 0 || s.clicks > 0)) || s.categories.length >= 2;
    if (retained) retainedSessions.push(s);
    else notRetainedSessions.push(s);
  }

  function cohort(label: string, list: typeof retainedSessions): RetentionCohort {
    const n = list.length || 1;
    return {
      label,
      sessionCount: list.length,
      avgTrustOpens: Math.round((list.reduce((a, s) => a + s.trustOpens, 0) / n) * 100) / 100,
      avgClicks: Math.round((list.reduce((a, s) => a + s.clicks, 0) / n) * 100) / 100,
      returnSignal: Math.round((list.filter((s) => s.returned).length / n) * 1000) / 1000,
    };
  }

  const headline =
    returnRate >= 0.2 ?
      `${Math.round(returnRate * 100)}% of sessions show return or sustained engagement — trust may be building.`
    : uniqueSessions >= 5 ?
      "Early retention is low — focus on first-session clarity and recommendation usefulness."
    : "Not enough sessions to assess retention yet.";

  return {
    evaluatedAt: new Date().toISOString(),
    uniqueSessions,
    returnSessions,
    returnRate: Math.round(returnRate * 1000) / 1000,
    repeatQuerySessions,
    categoryLoyalty: [...categoryCounts.entries()]
      .map(([category, repeatQueries]) => ({ category, repeatQueries }))
      .sort((a, b) => b.repeatQueries - a.repeatQueries)
      .slice(0, 8),
    cohorts: {
      retained: cohort("retained", retainedSessions),
      notRetained: cohort("not_retained", notRetainedSessions),
    },
    whyThisPickEngagementTrend: {
      last7dRate: Math.round(last7dRate * 1000) / 1000,
      prior7dRate: Math.round(prior7dRate * 1000) / 1000,
      trend,
    },
    headline,
  };
}
