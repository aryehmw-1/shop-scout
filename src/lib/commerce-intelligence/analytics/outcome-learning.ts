import { loadAnalyticsEvents } from "./events";
import { loadProductFeedback } from "../feedback/product-feedback";
import { loadServerBehavioralStore } from "../feedback/server-store";
import { loadSessionReplay } from "../session-replay/store";

export interface OutcomeLearningReport {
  evaluatedAt: string;
  repeatRetailerPreference: Array<{ retailer: string; clicks: number; repeatSelections: number }>;
  categoryEngagement: Array<{ category: string; sessions: number; matched: number }>;
  revisitRate: number;
  delayedAcceptanceProxy: number;
  regretSignals: {
    reversals: number;
    negativeFeedback: number;
    nonWinnerClicks: number;
  };
  trustDurabilityProxy: number;
  summary: string[];
}

/** Longer-horizon outcome patterns from anonymized beta signals. */
export function analyzeOutcomeLearning(): OutcomeLearningReport {
  const events = loadAnalyticsEvents().events;
  const behavioral = loadServerBehavioralStore();
  const feedback = loadProductFeedback();
  const sessions = loadSessionReplay().sessions;

  const repeatRetailerPreference = Object.entries(behavioral.retailers)
    .map(([retailer, r]) => ({
      retailer,
      clicks: r?.clicks ?? 0,
      repeatSelections: r?.repeatSelections ?? 0,
    }))
    .filter((r) => r.clicks >= 2 || r.repeatSelections >= 1)
    .sort((a, b) => b.clicks + b.repeatSelections - (a.clicks + a.repeatSelections));

  const categoryEngagement = new Map<string, { sessions: number; matched: number }>();
  for (const s of sessions) {
    const c = s.queryCategory;
    const cur = categoryEngagement.get(c) ?? { sessions: 0, matched: 0 };
    cur.sessions++;
    if (s.matched) cur.matched++;
    categoryEngagement.set(c, cur);
  }
  for (const e of events) {
    if (e.event === "query_category" && e.queryCategory) {
      const cur = categoryEngagement.get(e.queryCategory) ?? { sessions: 0, matched: 0 };
      cur.sessions++;
      categoryEngagement.set(e.queryCategory, cur);
    }
  }

  const sessionIds = new Set(events.map((e) => e.sessionId).filter(Boolean));
  const returnSessions = events.filter((e) => e.event === "session_return").length;
  const revisitRate = sessionIds.size ? returnSessions / sessionIds.size : 0;

  const usefulLater = feedback.entries.filter((e) => e.bought === true).length;
  const shown = events.filter((e) => e.event === "recommendation_shown").length;
  const delayedAcceptanceProxy = shown ? usefulLater / shown : 0;

  const nonWinnerClicks = events.filter(
    (e) => e.event === "offer_click" && e.meta?.clickedWinner === false,
  ).length;
  const reversals = Object.values(behavioral.retailers).reduce((n, r) => n + (r?.reversals ?? 0), 0);
  const negativeFeedback = feedback.entries.filter((e) => e.useful === false).length;

  const returnVisitors = events.filter((e) => e.event === "session_return").length;
  const positiveFeedback = feedback.entries.filter((e) => e.useful === true).length;
  const trustDurabilityProxy =
    shown > 0 ?
      Math.min(1, (returnVisitors * 0.4 + positiveFeedback * 0.3 + (shown - negativeFeedback) * 0.3) / shown)
    : 0;

  const summary: string[] = [];
  if (returnSessions >= 3) {
    summary.push(`${returnSessions} return sessions — users are coming back to the assistant.`);
  }
  if (nonWinnerClicks >= 3) {
    summary.push(
      `${nonWinnerClicks} clicks on non-winner stores — users often prefer an alternative to the recommended pick.`,
    );
  }
  if (reversals >= 2) {
    summary.push("Repeat reversal signals — recommendations may not feel durable to users.");
  }
  if (repeatRetailerPreference[0]) {
    summary.push(
      `Strong repeat preference for ${repeatRetailerPreference[0].retailer} (display ranking only).`,
    );
  }
  if (summary.length === 0) {
    summary.push("Collect more sessions to measure lasting trust and outcome patterns.");
  }

  return {
    evaluatedAt: new Date().toISOString(),
    repeatRetailerPreference: repeatRetailerPreference.slice(0, 10),
    categoryEngagement: [...categoryEngagement.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.sessions - a.sessions),
    revisitRate: Math.round(revisitRate * 1000) / 1000,
    delayedAcceptanceProxy: Math.round(delayedAcceptanceProxy * 1000) / 1000,
    regretSignals: { reversals, negativeFeedback, nonWinnerClicks },
    trustDurabilityProxy: Math.round(trustDurabilityProxy * 1000) / 1000,
    summary,
  };
}
