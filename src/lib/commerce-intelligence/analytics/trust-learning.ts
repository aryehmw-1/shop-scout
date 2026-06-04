import { loadAnalyticsEvents } from "./events";
import { feedbackSummary } from "../feedback/product-feedback";
import { loadSessionReplay } from "../session-replay/store";

export interface TrustLearningReport {
  evaluatedAt: string;
  immediateTrustProxy: number;
  detailAfterTrustRate: number;
  abandonmentAfterShown: number;
  categoriesHesitant: Array<{ category: string; detailRate: number; noMatch: number }>;
  honestyWordingHints: string[];
}

/** When users trust the default card vs need more explanation. */
export function analyzeTrustLearning(): TrustLearningReport {
  const events = loadAnalyticsEvents().events;
  const sessions = loadSessionReplay().sessions;
  const feedback = feedbackSummary();

  const shown = events.filter((e) => e.event === "recommendation_shown").length;
  const trustOpen = events.filter((e) => e.event === "trust_details_open").length;
  const analystOpen = events.filter((e) => e.event === "analyst_mode_open").length;
  const clicks = events.filter((e) => e.event === "offer_click").length;
  const abandon = events.filter((e) => e.event === "session_abandon").length;

  const immediateTrustProxy =
    shown > 0 ? Math.min(1, (clicks + feedback.usefulYes * 0.5) / shown) : 0;
  const detailAfterTrustRate = trustOpen > 0 ? analystOpen / trustOpen : 0;
  const abandonmentAfterShown = shown > 0 ? abandon / shown : 0;

  const byCat = new Map<string, { shown: number; trust: number; analyst: number; noMatch: number }>();
  for (const s of sessions) {
    const c = s.queryCategory;
    const cur = byCat.get(c) ?? { shown: 0, trust: 0, analyst: 0, noMatch: 0 };
    if (s.matched) cur.shown++;
    if (s.interactionTrail.includes("trust_details_open")) cur.trust++;
    if (s.interactionTrail.includes("analyst_mode_open")) cur.analyst++;
    byCat.set(c, cur);
  }
  for (const e of events) {
    if (e.event === "recommendation_no_match" && e.queryCategory) {
      const cur = byCat.get(e.queryCategory) ?? { shown: 0, trust: 0, analyst: 0, noMatch: 0 };
      cur.noMatch++;
      byCat.set(e.queryCategory, cur);
    }
  }

  const categoriesHesitant = [...byCat.entries()]
    .map(([category, m]) => ({
      category,
      detailRate: m.shown ? (m.trust + m.analyst) / m.shown : 0,
      noMatch: m.noMatch,
    }))
    .filter((c) => c.detailRate > 0.35 || c.noMatch >= 2)
    .sort((a, b) => b.detailRate - a.detailRate)
    .slice(0, 6);

  const honestyWordingHints: string[] = [];
  if (detailAfterTrustRate > 0.4 && analystOpen >= 3) {
    honestyWordingHints.push(
      "Users open “More detail” after “Why this pick” — surface one evidence line in the collapsed card.",
    );
  }
  if (immediateTrustProxy < 0.2 && shown >= 5) {
    honestyWordingHints.push(
      "Low click/useful rate after recommendations — try calmer, shorter trust summaries (EXPERIMENT_TRUST_SUMMARY_STYLE=a).",
    );
  }
  if (abandonmentAfterShown > 0.2) {
    honestyWordingHints.push(
      "Abandonment after recommendations shown — uncertainty may be too late; try trust_framing=b (uncertainty first).",
    );
  }
  if (categoriesHesitant[0]) {
    honestyWordingHints.push(
      `Most hesitation in “${categoriesHesitant[0].category}” — tighten uncertainty copy for that category.`,
    );
  }
  if (honestyWordingHints.length === 0) {
    honestyWordingHints.push("Collect more sessions to compare trust wording variants.");
  }

  return {
    evaluatedAt: new Date().toISOString(),
    immediateTrustProxy: Math.round(immediateTrustProxy * 1000) / 1000,
    detailAfterTrustRate: Math.round(detailAfterTrustRate * 1000) / 1000,
    abandonmentAfterShown: Math.round(abandonmentAfterShown * 1000) / 1000,
    categoriesHesitant,
    honestyWordingHints,
  };
}
