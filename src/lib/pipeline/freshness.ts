// Freshness / staleness policy. Revalidation happens via BACKGROUND JOBS only —
// never by live re-scraping during a user's search.

export type DemandTier = "high" | "general" | "low";

/** Max age (hours) before data is considered stale, by demand tier. */
const STALE_AFTER_HOURS: Record<DemandTier, number> = {
  high: 6,
  general: 24,
  low: 72,
};

/** Bucket a product into a demand tier from its search/click signals. */
export function demandTier(searchFrequency: number, clickFrequency: number): DemandTier {
  const signal = searchFrequency + clickFrequency * 2;
  if (signal >= 50) return "high";
  if (signal >= 5) return "general";
  return "low";
}

export function isStale(lastVerifiedAt: Date | null | undefined, tier: DemandTier, now = new Date()): boolean {
  if (!lastVerifiedAt) return true;
  const ageHours = (now.getTime() - lastVerifiedAt.getTime()) / 3_600_000;
  return ageHours > STALE_AFTER_HOURS[tier];
}

/**
 * Priority for the nightly validation queue (higher = validate first):
 *   most searched → most clicked → shown in top results → missing fields →
 *   oldest scrape.
 */
export function revalidationPriority(p: {
  searchFrequency: number;
  clickFrequency: number;
  shownInTopResults?: boolean;
  missingFields?: boolean;
  lastVerifiedAt?: Date | null;
  now?: Date;
}): number {
  const now = p.now ?? new Date();
  let score = 0;
  score += Math.min(p.searchFrequency, 1000) * 3;
  score += Math.min(p.clickFrequency, 1000) * 4;
  if (p.shownInTopResults) score += 200;
  if (p.missingFields) score += 150;
  const ageHours = p.lastVerifiedAt
    ? (now.getTime() - p.lastVerifiedAt.getTime()) / 3_600_000
    : 10_000;
  score += Math.min(ageHours, 1000);
  return Math.round(score);
}

export { STALE_AFTER_HOURS };
