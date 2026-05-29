/**
 * Dynamic indexing depth from engagement signals.
 */
export interface PopularitySignals {
  popularityScore?: number;
  searchFrequency?: number;
  clickFrequency?: number;
  refreshPriority?: number;
}

export function computeRefreshPriority(signals: PopularitySignals): number {
  const base = signals.refreshPriority ?? 50;
  const search = Math.min(30, (signals.searchFrequency ?? 0) * 0.5);
  const clicks = Math.min(25, (signals.clickFrequency ?? 0) * 0.8);
  const pop = Math.min(20, (signals.popularityScore ?? 0) * 20);
  return Math.round(Math.min(100, base + search + clicks + pop));
}

export function compareByRefreshPriority<T extends PopularitySignals>(
  a: T,
  b: T,
): number {
  return computeRefreshPriority(b) - computeRefreshPriority(a);
}

export function bumpSearchFrequency(current: number): number {
  return current + 1;
}

export function bumpClickFrequency(current: number): number {
  return current + 2;
}
