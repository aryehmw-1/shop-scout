import { isAmazonPaapiConfigured } from "./providers/amazon-paapi-config";

/** How to reuse saved prices from SQLite. Amazon PA-API is always attempted separately when configured. */
export type LivePricingProvider = "off" | "cache";

export function getLivePricingProvider(): LivePricingProvider {
  const raw = process.env.LIVE_PRICING_PROVIDER?.trim().toLowerCase();
  if (!raw || raw === "auto" || raw === "cache" || raw === "db") return "cache";
  return "off";
}

export function isLivePricingEnabled(): boolean {
  return getLivePricingProvider() === "cache" || isAmazonPaapiConfigured();
}

export function livePricingStatusMessage(): string {
  const parts: string[] = [];
  if (isAmazonPaapiConfigured()) {
    parts.push("Amazon live prices and photos via PA-API.");
  }
  if (getLivePricingProvider() === "cache") {
    parts.push("Other stores: recent saved prices when available.");
  } else {
    parts.push("Other stores: estimated catalog prices — open the store link to verify.");
  }
  parts.push("Photos: catalog, Open Food Facts (grocery), Openverse fallback; Amazon image on Amazon rows.");
  return parts.join(" ");
}
