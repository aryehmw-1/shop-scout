import { BETA_COHORT_LABELS, normalizeBetaCohort, type BetaCohort } from "../beta/cohort";
import { loadAnalyticsEvents } from "./events";
import { loadProductFeedback } from "../feedback/product-feedback";
import { loadSessionReplay } from "../session-replay/store";

export interface CohortMetrics {
  cohort: BetaCohort;
  label: string;
  sessions: number;
  matched: number;
  usefulYes: number;
  usefulNo: number;
  trustOpens: number;
  clicks: number;
}

export interface CohortBreakdownReport {
  evaluatedAt: string;
  cohorts: CohortMetrics[];
  headline: string;
}

export function analyzeCohortBreakdown(): CohortBreakdownReport {
  const events = loadAnalyticsEvents().events;
  const replay = loadSessionReplay().sessions;
  const feedback = loadProductFeedback();

  const map = new Map<BetaCohort, CohortMetrics>();

  function ensure(c: BetaCohort): CohortMetrics {
    let row = map.get(c);
    if (!row) {
      row = {
        cohort: c,
        label: BETA_COHORT_LABELS[c],
        sessions: 0,
        matched: 0,
        usefulYes: 0,
        usefulNo: 0,
        trustOpens: 0,
        clicks: 0,
      };
      map.set(c, row);
    }
    return row;
  }

  for (const s of replay) {
    const c = normalizeBetaCohort(s.cohort);
    const row = ensure(c);
    row.sessions++;
    if (s.matched) row.matched++;
    if (s.interactionTrail.includes("trust_details_open")) row.trustOpens++;
    if (s.interactionTrail.includes("offer_click")) row.clicks++;
    if (s.feedback?.useful === true) row.usefulYes++;
    if (s.feedback?.useful === false) row.usefulNo++;
  }

  for (const e of events) {
    const c = normalizeBetaCohort(
      typeof e.meta?.cohort === "string" ? e.meta.cohort : undefined,
    );
    if (e.event === "trust_details_open") ensure(c).trustOpens++;
    if (e.event === "offer_click") ensure(c).clicks++;
  }

  for (const e of feedback.entries) {
    const c = normalizeBetaCohort(e.cohort);
    const row = ensure(c);
    if (e.useful === true) row.usefulYes++;
    if (e.useful === false) row.usefulNo++;
  }

  const cohorts = [...map.values()].sort((a, b) => b.sessions - a.sessions);
  const top = cohorts[0];
  const headline =
    top && top.sessions > 0 ?
      `${top.label}: ${top.sessions} sessions, ${top.matched} matched, ${top.usefulYes} positive feedback.`
    : "Tag cohorts with NEXT_PUBLIC_BETA_COHORT or ?cohort=internal for operator splits.";

  return { evaluatedAt: new Date().toISOString(), cohorts, headline };
}
