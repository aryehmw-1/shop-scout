import { loadAnalyticsEvents } from "./events";
import { loadSessionReplay } from "../session-replay/store";
import { analyzeRetention } from "./retention";

export interface SessionSuccessInsight {
  id: string;
  message: string;
  evidence?: string;
}

export interface SessionSuccessReport {
  evaluatedAt: string;
  sampleSize: number;
  successfulPatterns: SessionSuccessInsight[];
  retainedPatterns: SessionSuccessInsight[];
  abandonmentHotspots: SessionSuccessInsight[];
  fastestTrustCategories: Array<{ category: string; trustOpensPerSession: number }>;
  confidentRetailers: Array<{ retailer: string; winnerClicks: number }>;
  headline: string;
}

/** What “good” beta sessions look like vs abandoners. */
export function analyzeSessionSuccess(): SessionSuccessReport {
  const replay = loadSessionReplay().sessions;
  const events = loadAnalyticsEvents().events;
  const retention = analyzeRetention();

  const successful = replay.filter(
    (s) => s.matched && s.interactionTrail.includes("offer_click"),
  );
  const abandonedIds = new Set(
    events.filter((e) => e.event === "session_abandon").map((e) => e.sessionId),
  );
  const abandoned = replay.filter(
    (s) => abandonedIds.has(s.sessionId) || (!s.matched && s.interactionTrail.length <= 1),
  );
  const successfulPatterns: SessionSuccessInsight[] = [];
  if (successful.length >= 2) {
    const withTrust = successful.filter((s) =>
      s.interactionTrail.includes("trust_details_open"),
    ).length;
    successfulPatterns.push({
      id: "click_after_match",
      message: "Successful sessions match a product and click a store offer.",
      evidence: `${successful.length} sessions`,
    });
    if (withTrust / successful.length < 0.5) {
      successfulPatterns.push({
        id: "trust_optional",
        message: "Many successful users skip “Why this pick” — default card may be sufficient.",
      });
    } else {
      successfulPatterns.push({
        id: "trust_then_click",
        message: "Users often expand trust before clicking — explanations support conversion.",
      });
    }
  }

  const retainedPatterns: SessionSuccessInsight[] = [];
  const rc = retention.cohorts.retained;
  const nrc = retention.cohorts.notRetained;
  if (retention.uniqueSessions >= 5) {
    retainedPatterns.push({
      id: "retained_engagement",
      message: `Retained sessions average ${rc.avgTrustOpens} trust opens and ${rc.avgClicks} clicks vs ${nrc.avgClicks} for non-retained.`,
    });
  }
  if (retention.returnRate >= 0.15) {
    retainedPatterns.push({
      id: "return_visits",
      message: `${Math.round(retention.returnRate * 100)}% show return or multi-step engagement.`,
    });
  }

  const abandonmentHotspots: SessionSuccessInsight[] = [];
  const noMatch = replay.filter((s) => !s.matched).length;
  if (noMatch >= 3) {
    abandonmentHotspots.push({
      id: "no_match",
      message: "Abandonment often follows no intelligence match — improve catalog or query clarify.",
      evidence: `${noMatch} no-match replays`,
    });
  }
  const detailNoClick = replay.filter(
    (s) => s.interactionTrail.includes("analyst_mode_open") && !s.interactionTrail.includes("offer_click"),
  ).length;
  if (detailNoClick >= 2) {
    abandonmentHotspots.push({
      id: "detail_stall",
      message: "Users open “More detail” but don’t shop — pick may feel uncertain or incomplete.",
    });
  }

  const catTrust = new Map<string, { sessions: number; trust: number }>();
  for (const s of replay) {
    if (!s.matched) continue;
    const c = s.queryCategory;
    const cur = catTrust.get(c) ?? { sessions: 0, trust: 0 };
    cur.sessions++;
    if (s.interactionTrail.includes("trust_details_open")) cur.trust++;
    catTrust.set(c, cur);
  }
  const fastestTrustCategories = [...catTrust.entries()]
    .filter(([, v]) => v.sessions >= 2)
    .map(([category, v]) => ({
      category,
      trustOpensPerSession: Math.round((v.trust / v.sessions) * 100) / 100,
    }))
    .sort((a, b) => b.trustOpensPerSession - a.trustOpensPerSession)
    .slice(0, 5);

  const retailerWins = new Map<string, number>();
  for (const s of successful) {
    if (s.winnerRetailer) {
      retailerWins.set(s.winnerRetailer, (retailerWins.get(s.winnerRetailer) ?? 0) + 1);
    }
  }
  const confidentRetailers = [...retailerWins.entries()]
    .map(([retailer, winnerClicks]) => ({ retailer, winnerClicks }))
    .sort((a, b) => b.winnerClicks - a.winnerClicks)
    .slice(0, 5);

  const headline =
    successful.length >= 3 ?
      `${successful.length} successful shop sessions — ${retention.headline}`
    : replay.length >= 5 ?
      "Few shop clicks yet — prioritize trusted cohorts and category-focused invites."
    : "Collect more beta sessions before drawing success patterns.";

  return {
    evaluatedAt: new Date().toISOString(),
    sampleSize: replay.length,
    successfulPatterns:
      successfulPatterns.length ?
        successfulPatterns
      : [{ id: "collect", message: "Need more matched sessions with offer clicks." }],
    retainedPatterns:
      retainedPatterns.length ?
        retainedPatterns
      : [{ id: "collect", message: "Need more return / multi-query sessions." }],
    abandonmentHotspots:
      abandonmentHotspots.length ?
        abandonmentHotspots
      : [{ id: "none", message: "No dominant abandonment pattern detected yet." }],
    fastestTrustCategories,
    confidentRetailers,
    headline,
  };
}
