import type { RetailerId } from "../../types";

export interface RetailerFetchProfile {
  extraHeaders?: Record<string, string>;
  /** Prefer proxy when INDEX_PROXY_LIST is set (even if other retailers skip). */
  preferProxy?: boolean;
  maxAttempts?: number;
}

const PROFILES: Partial<Record<RetailerId, RetailerFetchProfile>> = {
  walmart: {
    preferProxy: true,
    maxAttempts: 4,
    extraHeaders: {
      Referer: "https://www.walmart.com/",
      Origin: "https://www.walmart.com",
      "Sec-Ch-Ua": '"Chromium";v="122", "Google Chrome";v="122", "Not_A Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"macOS"',
      "Upgrade-Insecure-Requests": "1",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
    },
  },
  target: {
    preferProxy: true,
    maxAttempts: 3,
    extraHeaders: {
      Referer: "https://www.target.com/",
      Origin: "https://www.target.com",
      "Sec-Ch-Ua": '"Chromium";v="122", "Google Chrome";v="122", "Not_A Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"macOS"',
    },
  },
  amazon: {
    preferProxy: true,
    maxAttempts: 3,
    extraHeaders: {
      Referer: "https://www.amazon.com/",
      "Upgrade-Insecure-Requests": "1",
    },
  },
  costco: { preferProxy: true, maxAttempts: 3 },
  kroger: { preferProxy: true, maxAttempts: 3 },
  aldi: { maxAttempts: 2 },
};

export function getRetailerFetchProfile(retailerId: RetailerId): RetailerFetchProfile {
  return PROFILES[retailerId] ?? {};
}

/** Retailers that always use proxy when INDEX_PROXY_LIST / INDEX_PROXY_URL is set. */
export function retailersPreferringProxy(): RetailerId[] {
  const fromEnv = process.env.INDEX_PROXY_RETAILERS?.trim();
  if (fromEnv) {
    return fromEnv.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()) as RetailerId[];
  }
  return ["walmart", "amazon", "target", "kroger", "costco"];
}

export function shouldUseProxyForRetailer(retailerId: RetailerId): boolean {
  if (!process.env.INDEX_PROXY_LIST?.trim() && !process.env.INDEX_PROXY_URL?.trim()) {
    return false;
  }
  const profile = getRetailerFetchProfile(retailerId);
  if (profile.preferProxy) return true;
  return retailersPreferringProxy().includes(retailerId);
}
