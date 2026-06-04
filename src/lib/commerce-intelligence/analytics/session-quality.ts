import { loadAnalyticsEvents } from "./events";
import { loadSessionReplay } from "../session-replay/store";

export type SessionQualityLabel = "successful" | "abandoned" | "hesitant" | "engaged";

export interface SessionQualityRow {
  sessionId: string;
  at: string;
  category: string;
  label: SessionQualityLabel;
  matched: boolean;
  detailOpens: number;
  onboardingSignal?: string;
  summary: string;
}

export interface SessionQualityReport {
  evaluatedAt: string;
  successful: number;
  abandoned: number;
  hesitant: number;
  engaged: number;
  detailUsageRate: number;
  onboardingCompleted: number;
  onboardingSkipped: number;
  samples: SessionQualityRow[];
}

function labelSession(opts: {
  matched: boolean;
  trail: string[];
  abandonEvent: boolean;
}): SessionQualityLabel {
  if (opts.abandonEvent || (!opts.matched && opts.trail.length <= 1)) return "abandoned";
  const detail = opts.trail.filter((e) => e === "analyst_mode_open").length;
  const trust = opts.trail.includes("trust_details_open");
  if (opts.trail.includes("offer_click") && opts.matched) return "successful";
  if (detail >= 1 || (trust && !opts.trail.includes("offer_click"))) return "hesitant";
  if (trust || opts.trail.includes("recommendation_shown")) return "engaged";
  return "abandoned";
}

/** Successful vs abandoned vs detail-heavy sessions. */
export function analyzeSessionQuality(): SessionQualityReport {
  const replay = loadSessionReplay().sessions;
  const events = loadAnalyticsEvents().events;

  const abandonIds = new Set(
    events.filter((e) => e.event === "session_abandon" && e.sessionId).map((e) => e.sessionId!),
  );
  const onboardingCompleted = events.filter((e) => e.event === "onboarding_completed").length;
  const onboardingSkipped = events.filter((e) => e.event === "onboarding_dismissed_early").length;

  const bySession = new Map<string, SessionQualityRow>();

  for (const s of replay) {
    const label = labelSession({
      matched: s.matched,
      trail: s.interactionTrail,
      abandonEvent: abandonIds.has(s.sessionId),
    });
    const detailOpens = s.interactionTrail.filter((e) => e === "analyst_mode_open").length;
    bySession.set(s.sessionId, {
      sessionId: s.sessionId,
      at: s.at,
      category: s.queryCategory,
      label,
      matched: s.matched,
      detailOpens,
      summary:
        label === "successful" ? "Clicked through after match"
        : label === "hesitant" ? "Opened detail without clear acceptance"
        : label === "engaged" ? "Explored trust, no shop click yet"
        : "Left before value",
    });
  }

  const rows = [...bySession.values()];
  const successful = rows.filter((r) => r.label === "successful").length;
  const abandoned = rows.filter((r) => r.label === "abandoned").length;
  const hesitant = rows.filter((r) => r.label === "hesitant").length;
  const engaged = rows.filter((r) => r.label === "engaged").length;
  const shown = events.filter((e) => e.event === "recommendation_shown").length;
  const detail = events.filter((e) => e.event === "analyst_mode_open").length;

  return {
    evaluatedAt: new Date().toISOString(),
    successful,
    abandoned,
    hesitant,
    engaged,
    detailUsageRate: shown ? detail / shown : 0,
    onboardingCompleted,
    onboardingSkipped,
    samples: rows
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 25),
  };
}
