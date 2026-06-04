import { loadAnalyticsEvents } from "./events";
import { loadProductFeedback } from "../feedback/product-feedback";
import { loadSessionReplay } from "../session-replay/store";
import { analyzeRetention } from "./retention";

export interface CategoryStrengthRow {
  category: string;
  sessions: number;
  matchRate: number;
  trustScore: number;
  retentionSignal: number;
  strength: "strong" | "moderate" | "weak";
  focusNote: string;
}

export interface CategoryStrengthReport {
  evaluatedAt: string;
  strongestVerticals: CategoryStrengthRow[];
  weakestTrust: CategoryStrengthRow[];
  bestRetailerPatterns: Array<{ retailer: string; positiveClicks: number }>;
  productFocusHeadline: string;
}

/** Vertical focus for product-market learning. */
export function analyzeCategoryStrength(): CategoryStrengthReport {
  const sessions = loadSessionReplay().sessions;
  const events = loadAnalyticsEvents().events;
  const feedback = loadProductFeedback();
  const retention = analyzeRetention();

  const byCat = new Map<
    string,
    { total: number; matched: number; usefulYes: number; usefulNo: number; clicks: number }
  >();

  for (const s of sessions) {
    const c = s.queryCategory;
    const cur = byCat.get(c) ?? { total: 0, matched: 0, usefulYes: 0, usefulNo: 0, clicks: 0 };
    cur.total++;
    if (s.matched) cur.matched++;
    if (s.feedback?.useful === true) cur.usefulYes++;
    if (s.feedback?.useful === false) cur.usefulNo++;
    if (s.interactionTrail.includes("offer_click")) cur.clicks++;
    byCat.set(c, cur);
  }

  for (const e of events) {
    if (e.event === "offer_click" && e.queryCategory) {
      const cur = byCat.get(e.queryCategory) ?? {
        total: 0,
        matched: 0,
        usefulYes: 0,
        usefulNo: 0,
        clicks: 0,
      };
      cur.clicks++;
      byCat.set(e.queryCategory, cur);
    }
  }

  for (const e of feedback.entries) {
    const cat =
      sessions.find((s) => s.canonicalId === e.canonicalId)?.queryCategory ?? "general";
    const cur = byCat.get(cat) ?? { total: 0, matched: 0, usefulYes: 0, usefulNo: 0, clicks: 0 };
    if (e.useful === true) cur.usefulYes++;
    if (e.useful === false) cur.usefulNo++;
    byCat.set(cat, cur);
  }

  const rows: CategoryStrengthRow[] = [...byCat.entries()].map(([category, m]) => {
    const matchRate = m.total ? m.matched / m.total : 0;
    const trustDenom = m.usefulYes + m.usefulNo;
    const trustScore = trustDenom ? m.usefulYes / trustDenom : 0.5;
    const retentionSignal =
      retention.categoryLoyalty.find((x) => x.category === category)?.repeatQueries ?? 0;
    const score = matchRate * 0.35 + trustScore * 0.35 + Math.min(1, m.clicks / 5) * 0.3;
    const strength: CategoryStrengthRow["strength"] =
      score >= 0.6 ? "strong"
      : score < 0.35 ? "weak"
      : "moderate";

    let focusNote = "Collect more sessions in this vertical";
    if (strength === "strong") focusNote = "Prioritize catalog depth and marketing here";
    else if (matchRate < 0.5) focusNote = "Improve match rate or ingest for this category";
    else if (trustScore < 0.4) focusNote = "Trust copy and uncertainty need tuning";

    return {
      category,
      sessions: m.total,
      matchRate: Math.round(matchRate * 1000) / 1000,
      trustScore: Math.round(trustScore * 1000) / 1000,
      retentionSignal,
      strength,
      focusNote,
    };
  });

  rows.sort((a, b) => {
    const sa = a.matchRate * 0.4 + a.trustScore * 0.4 + a.retentionSignal * 0.02;
    const sb = b.matchRate * 0.4 + b.trustScore * 0.4 + b.retentionSignal * 0.02;
    return sb - sa;
  });

  const retailerClicks = new Map<string, number>();
  for (const e of events) {
    if (e.event === "offer_click" && e.retailer) {
      retailerClicks.set(e.retailer, (retailerClicks.get(e.retailer) ?? 0) + 1);
    }
  }

  const strongest = rows.filter((r) => r.strength === "strong").slice(0, 5);
  const weakest = [...rows].reverse().filter((r) => r.strength === "weak").slice(0, 5);

  const productFocusHeadline =
    strongest[0] ?
      `Strongest vertical: ${strongest[0].category} — weakest trust: ${weakest[0]?.category ?? "n/a"}.`
    : "Need category-tagged beta sessions to rank vertical strength.";

  return {
    evaluatedAt: new Date().toISOString(),
    strongestVerticals: strongest.length ? strongest : rows.slice(0, 3),
    weakestTrust: weakest,
    bestRetailerPatterns: [...retailerClicks.entries()]
      .map(([retailer, positiveClicks]) => ({ retailer, positiveClicks }))
      .sort((a, b) => b.positiveClicks - a.positiveClicks)
      .slice(0, 6),
    productFocusHeadline,
  };
}
