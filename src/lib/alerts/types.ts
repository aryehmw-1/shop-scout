/** Lightweight future hooks — no full alert system yet. */

export interface PriceWatchIntent {
  catalogId: string;
  targetPriceUsd?: number;
  retailerId?: string;
  createdAt: string;
  notifyEmail?: boolean;
}

export interface SavedProductWatch {
  catalogId: string;
  title: string;
  imageUrl?: string;
  targetPriceUsd?: number;
  lastSeenPriceUsd?: number;
  addedAt: string;
}

export interface UserAlertPreferences {
  priceDropEnabled: boolean;
  email?: string;
  minDropPercent?: number;
}

export const WATCHLIST_STORAGE_KEY = "shop-scout:watchlist:v1";
export const ALERT_PREFS_KEY = "shop-scout:alert-prefs:v1";

export function readWatchlist(): SavedProductWatch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedProductWatch[]) : [];
  } catch {
    return [];
  }
}

export function writeWatchlist(items: SavedProductWatch[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(items));
}

export function addToWatchlist(entry: SavedProductWatch): SavedProductWatch[] {
  const list = readWatchlist().filter((w) => w.catalogId !== entry.catalogId);
  list.unshift(entry);
  writeWatchlist(list.slice(0, 50));
  return list;
}

export function readAlertPreferences(): UserAlertPreferences {
  if (typeof window === "undefined") return { priceDropEnabled: false };
  try {
    const raw = localStorage.getItem(ALERT_PREFS_KEY);
    return raw ? (JSON.parse(raw) as UserAlertPreferences) : { priceDropEnabled: false };
  } catch {
    return { priceDropEnabled: false };
  }
}
