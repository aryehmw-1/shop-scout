import type { HistoryPoint } from "./price-history";
import { ownDbHistoryDays } from "../own-db/config";

export interface AveragePrice {
  priceUsd: number;
  confidence: number;
  sampleCount: number;
  windowDays: number;
  priceNote: string;
  latestImageUrl?: string;
  latestStoreTitle?: string;
}

const MIN_POINTS = 3;

/**
 * Simple average over the last N days of daily checks — good enough after ~30 days.
 */
export function averagePriceFromHistory(
  points: HistoryPoint[],
  windowDays = ownDbHistoryDays(),
): AveragePrice | null {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const recent = points
    .filter((p) => p.observedAt.getTime() >= cutoff)
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

  if (recent.length < MIN_POINTS) return null;

  const sum = recent.reduce((s, p) => s + p.priceUsd, 0);
  const priceUsd = Math.round((sum / recent.length) * 100) / 100;
  const confidence = Math.min(0.9, 0.48 + recent.length * 0.012);

  const latest = recent[recent.length - 1];
  const daysLabel =
    recent.length >= windowDays - 2 ?
      `${windowDays}-day`
    : `${recent.length}-day`;

  return {
    priceUsd,
    confidence,
    sampleCount: recent.length,
    windowDays,
    priceNote: `${daysLabel} average · from our daily checks`,
    latestImageUrl: [...recent].reverse().find((p) => p.imageUrl)?.imageUrl ?? undefined,
    latestStoreTitle: latest.storeTitle ?? undefined,
  };
}
