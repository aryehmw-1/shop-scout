import { loadAnalyticsEvents } from "./events";
import { loadProductFeedback } from "../feedback/product-feedback";
import { loadSessionReplay } from "../session-replay/store";

export interface SegmentValue {
  category: string;
  valueScore: number;
  trustScore: number;
  engagementScore: number;
  note: string;
}

export interface ProductValueReport {
  evaluatedAt: string;
  strongestSegments: SegmentValue[];
  weakestSegments: SegmentValue[];
  overallHeadline: string;
}

/** Which categories/workflows deliver the most beta value. */
export function analyzeProductValue(): ProductValueReport {
  const events = loadAnalyticsEvents().events;
  const feedback = loadProductFeedback();
  const sessions = loadSessionReplay().sessions;

  const byCat = new Map<
    string,
    { shown: number; useful: number; notUseful: number; clicks: number; matched: number }
  >();

  for (const s of sessions) {
    const c = s.queryCategory;
    const cur = byCat.get(c) ?? { shown: 0, useful: 0, notUseful: 0, clicks: 0, matched: 0 };
    if (s.matched) cur.matched++;
    byCat.set(c, cur);
  }

  for (const e of events) {
    const cat = e.queryCategory ?? "general";
    const cur = byCat.get(cat) ?? { shown: 0, useful: 0, notUseful: 0, clicks: 0, matched: 0 };
    if (e.event === "recommendation_shown") cur.shown++;
    if (e.event === "offer_click") cur.clicks++;
    byCat.set(cat, cur);
  }

  for (const f of feedback.entries) {
    const cat =
      sessions.find((s) => s.canonicalId === f.canonicalId)?.queryCategory ?? "general";
    const cur = byCat.get(cat) ?? { shown: 0, useful: 0, notUseful: 0, clicks: 0, matched: 0 };
    if (f.useful === true) cur.useful++;
    if (f.useful === false) cur.notUseful++;
    byCat.set(cat, cur);
  }

  const segments: SegmentValue[] = [...byCat.entries()].map(([category, m]) => {
    const engagementScore = m.shown ? (m.clicks + m.useful) / m.shown : 0;
    const trustScore =
      m.useful + m.notUseful > 0 ? m.useful / (m.useful + m.notUseful) : 0.5;
    const valueScore = engagementScore * 0.6 + trustScore * 0.4;
    let note = "Limited data";
    if (valueScore >= 0.65) note = "Strong repeat engagement and positive signals";
    else if (valueScore < 0.35) note = "Weak trust or low engagement — investigate";
    else if (m.matched < m.shown * 0.5) note = "Match rate low — catalog or query friction";

    return {
      category,
      valueScore: Math.round(valueScore * 1000) / 1000,
      trustScore: Math.round(trustScore * 1000) / 1000,
      engagementScore: Math.round(engagementScore * 1000) / 1000,
      note,
    };
  });

  segments.sort((a, b) => b.valueScore - a.valueScore);

  const strongest = segments.filter((s) => s.valueScore >= 0.5).slice(0, 5);
  const weakest = [...segments].reverse().filter((s) => s.valueScore < 0.45).slice(0, 5);

  const overallHeadline =
    strongest[0] ?
      `Strongest value today in “${strongest[0].category}” — weakest areas need trust or match improvements.`
    : "Need more category-tagged sessions to rank product value by segment.";

  return {
    evaluatedAt: new Date().toISOString(),
    strongestSegments: strongest.length ? strongest : segments.slice(0, 3),
    weakestSegments: weakest,
    overallHeadline,
  };
}
