import type { RetailerId } from "../types";

/** First 3 digits of ZIP → US region bucket (coarse market model). */
export function zipToRegion(zip: string): string {
  const prefix = zip.replace(/\D/g, "").slice(0, 3);
  const n = parseInt(prefix, 10);
  if (Number.isNaN(n)) return "default";
  if (n >= 10 && n <= 14) return "northeast";
  if (n >= 15 && n <= 19) return "midatlantic";
  if (n >= 20 && n <= 29) return "southeast";
  if (n >= 30 && n <= 38) return "south";
  if (n >= 39 && n <= 49) return "midwest";
  if (n >= 50 && n <= 59) return "plains";
  if (n >= 60 && n <= 69) return "southwest";
  if (n >= 70 && n <= 79) return "south";
  if (n >= 80 && n <= 88) return "mountain";
  if (n >= 90 && n <= 99) return "west";
  return "default";
}

/** Retailers with strong regional presence (higher local likelihood in-region). */
const REGIONAL_STRONG: Partial<Record<RetailerId, string[]>> = {
  heb: ["south"],
  publix: ["southeast", "south"],
  meijer: ["midwest"],
  hyvee: ["midwest", "plains"],
  wegmans: ["northeast", "midatlantic"],
  albertsons: ["west", "mountain", "southwest"],
  safeway: ["west", "mountain"],
  vons: ["west"],
  jewelosco: ["midwest"],
  stopandshop: ["northeast", "midatlantic"],
  giantfood: ["midatlantic", "northeast"],
  dunhams: ["midwest", "northeast"],
  scheels: ["midwest", "plains", "mountain"],
};

export function regionalAvailabilityBoost(
  zip: string,
  retailer: RetailerId,
): number {
  const region = zipToRegion(zip);
  const regions = REGIONAL_STRONG[retailer];
  if (!regions) return 0;
  return regions.includes(region) ? 0.22 : -0.08;
}
