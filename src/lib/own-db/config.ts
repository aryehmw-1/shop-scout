/** How many days of daily checks to keep and use for averages (default 30). */
export function ownDbHistoryDays(): number {
  const raw = process.env.PRICE_HISTORY_DAYS?.trim();
  const n = raw ? parseInt(raw, 10) : 30;
  return Number.isFinite(n) && n >= 7 ? n : 30;
}

/** During search/chat: read saved prices only — no live retailer API calls. */
export function searchUsesOwnDbOnly(): boolean {
  const raw = process.env.OWN_DB_SEARCH_MODE?.trim().toLowerCase();
  if (raw === "live") return false;
  return true;
}

export const DAILY_INDEX_SOURCE = "daily_index";

/** Only the daily job writes history rows — not every user search. */
export function recordSnapshotsOnSearch(): boolean {
  return process.env.RECORD_SNAPSHOTS_ON_SEARCH === "true";
}

/** Online compare only — local/near-you row is disabled site-wide. */
export function searchOnlineOnly(): boolean {
  return true;
}
