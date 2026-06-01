import type { RetailerId } from "../../types";
import { getRetailerAdapter } from "../../offers/retailer-adapters";
import type { RetailerIntelligenceProfile } from "./types";

const HOSTNAMES: Partial<Record<RetailerId, string[]>> = {
  walmart: ["walmart.com", "www.walmart.com"],
  target: ["target.com", "www.target.com"],
  amazon: ["amazon.com", "www.amazon.com"],
  kroger: ["kroger.com", "www.kroger.com"],
  costco: ["costco.com", "www.costco.com"],
  aldi: ["aldi.us", "www.aldi.us"],
};

function profile(
  retailerId: RetailerId,
  partial: Omit<RetailerIntelligenceProfile, "retailerId" | "adapter" | "hostnames">,
): RetailerIntelligenceProfile {
  return {
    retailerId,
    hostnames: HOSTNAMES[retailerId] ?? [],
    adapter: getRetailerAdapter(retailerId),
    ...partial,
  };
}

/** Capability registry — classifies retailers and routes extraction/fetch strategies. */
const PROFILES: Partial<Record<RetailerId, RetailerIntelligenceProfile>> = {
  walmart: profile("walmart", {
    displayName: "Walmart",
    fetchStrategy: "rotating_proxy",
    extractionStrategies: ["adapter_custom", "next_data", "json_ld", "static_html"],
    capabilities: {
      searchParse: true,
      pdpParse: false,
      linkIngest: true,
      apiFallback: false,
      proxyRequired: true,
      antiBot: "high",
    },
    trustPrior: 0.72,
  }),
  target: profile("target", {
    displayName: "Target",
    fetchStrategy: "rotating_proxy",
    extractionStrategies: ["adapter_custom", "next_data", "json_ld", "react_hydration"],
    capabilities: {
      searchParse: true,
      pdpParse: true,
      linkIngest: true,
      apiFallback: false,
      proxyRequired: true,
      antiBot: "high",
    },
    trustPrior: 0.74,
  }),
  amazon: profile("amazon", {
    displayName: "Amazon",
    fetchStrategy: "rotating_proxy",
    extractionStrategies: ["adapter_custom", "static_html", "api_fallback"],
    capabilities: {
      searchParse: true,
      pdpParse: true,
      linkIngest: true,
      apiFallback: true,
      proxyRequired: true,
      antiBot: "high",
    },
    trustPrior: 0.78,
  }),
  kroger: profile("kroger", {
    displayName: "Kroger",
    fetchStrategy: "rotating_proxy",
    extractionStrategies: ["adapter_custom", "json_ld", "static_html"],
    capabilities: {
      searchParse: true,
      pdpParse: true,
      linkIngest: true,
      apiFallback: false,
      proxyRequired: true,
      antiBot: "medium",
    },
    trustPrior: 0.7,
  }),
  costco: profile("costco", {
    displayName: "Costco",
    fetchStrategy: "rotating_proxy",
    extractionStrategies: ["adapter_custom", "json_ld", "static_html"],
    capabilities: {
      searchParse: true,
      pdpParse: true,
      linkIngest: true,
      apiFallback: false,
      proxyRequired: true,
      antiBot: "medium",
    },
    trustPrior: 0.71,
  }),
  aldi: profile("aldi", {
    displayName: "Aldi",
    fetchStrategy: "direct_http",
    extractionStrategies: ["adapter_custom", "json_ld"],
    capabilities: {
      searchParse: true,
      pdpParse: true,
      linkIngest: true,
      apiFallback: false,
      proxyRequired: false,
      antiBot: "low",
    },
    trustPrior: 0.68,
  }),
};

export function getRetailerIntelligenceProfile(
  retailerId: RetailerId,
): RetailerIntelligenceProfile | undefined {
  return PROFILES[retailerId];
}

export function listRetailerIntelligenceProfiles(): RetailerIntelligenceProfile[] {
  return Object.values(PROFILES).filter(Boolean) as RetailerIntelligenceProfile[];
}

export function retailerIdFromHostname(hostname: string): RetailerId | undefined {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  for (const profile of listRetailerIntelligenceProfiles()) {
    if (profile.hostnames.some((h) => h.replace(/^www\./, "") === host)) {
      return profile.retailerId;
    }
  }
  return undefined;
}

export function requiresProxyForRetailer(retailerId: RetailerId): boolean {
  return getRetailerIntelligenceProfile(retailerId)?.capabilities.proxyRequired ?? false;
}

export function extractionStrategiesForRetailer(
  retailerId: RetailerId,
): RetailerIntelligenceProfile["extractionStrategies"] {
  return (
    getRetailerIntelligenceProfile(retailerId)?.extractionStrategies ?? [
      "json_ld",
      "static_html",
    ]
  );
}
