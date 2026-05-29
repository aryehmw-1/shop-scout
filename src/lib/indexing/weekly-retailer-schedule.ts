import { RETAILER_IDS } from "../retailers/meta";
import type { RetailerId } from "../types";

export const WEEKLY_ROTATION_DAYS = 7;

function stableBucket(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
  }
  return Math.abs(h) % mod;
}

/** 0 = Sunday … 6 = Saturday — same bucket every week for a given store. */
export function retailerWeekdayBucket(retailerId: RetailerId): number {
  return stableBucket(retailerId, WEEKLY_ROTATION_DAYS);
}

export function getRetailersForWeekday(day: number): RetailerId[] {
  const weekday = ((day % 7) + 7) % 7;
  return RETAILER_IDS.filter((r) => retailerWeekdayBucket(r) === weekday);
}

export function getTodaysScheduledRetailers(date = new Date()): RetailerId[] {
  return getRetailersForWeekday(date.getDay());
}

export function isWeeklyStoreRotationEnabled(): boolean {
  return process.env.WEEKLY_STORE_ROTATION !== "off";
}

/** Quotes stay valid until the store’s next weekly slot (+ buffer). */
export function weeklyQuoteExpiresAt(from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + WEEKLY_ROTATION_DAYS + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function weekdayLabel(day: number): string {
  return WEEKDAY_NAMES[((day % 7) + 7) % 7] ?? "Unknown";
}

export interface WeeklyRotationPlan {
  enabled: boolean;
  weekday: number;
  weekdayName: string;
  retailersTonight: RetailerId[];
  retailersPerDay: number;
  totalRetailers: number;
  expiresAt: Date;
}

export function getWeeklyRotationPlan(date = new Date()): WeeklyRotationPlan {
  const enabled = isWeeklyStoreRotationEnabled();
  const weekday = date.getDay();
  const retailersTonight =
    enabled ? getTodaysScheduledRetailers(date) : [...RETAILER_IDS];

  return {
    enabled,
    weekday,
    weekdayName: weekdayLabel(weekday),
    retailersTonight,
    retailersPerDay: enabled ?
      Math.ceil(RETAILER_IDS.length / WEEKLY_ROTATION_DAYS)
    : RETAILER_IDS.length,
    totalRetailers: RETAILER_IDS.length,
    expiresAt: weeklyQuoteExpiresAt(date),
  };
}

/** All retailers in one run — use for bootstrap / manual full index. */
export function getFullIndexRotationPlan(date = new Date()): WeeklyRotationPlan {
  return {
    enabled: false,
    weekday: date.getDay(),
    weekdayName: weekdayLabel(date.getDay()),
    retailersTonight: [...RETAILER_IDS],
    retailersPerDay: RETAILER_IDS.length,
    totalRetailers: RETAILER_IDS.length,
    expiresAt: weeklyQuoteExpiresAt(date),
  };
}
