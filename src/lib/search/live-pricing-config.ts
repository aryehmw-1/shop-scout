import { isAmazonPaapiConfigured } from "./providers/amazon-paapi-config";
import { searchUsesOwnDbOnly } from "../own-db/config";

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
  if (searchUsesOwnDbOnly()) {
    parts.push(
      "Prices and photos come from Shop Scout’s own database (updated once per day).",
    );
  } else if (isAmazonPaapiConfigured()) {
    parts.push("Amazon live prices via PA-API on each search.");
  }
  if (getLivePricingProvider() === "cache") {
    parts.push("Daytime searches read saved daily checks — no constant retailer polling.");
  }
  parts.push(
    "After ~30 daily checks, stores show a rolling average instead of catalog estimates.",
  );
  return parts.join(" ");
}
