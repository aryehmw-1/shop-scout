import type { CommerceIntelligenceGraph } from "../graph/types";

export type MarketSignalKind =
  | "unusual_price_shift"
  | "suspicious_discount"
  | "synchronized_pricing"
  | "outlier_behavior"
  | "sale_spike";

export interface MarketSignal {
  kind: MarketSignalKind;
  severity: "info" | "warning";
  message: string;
  retailers?: string[];
}

export function detectMarketSignals(graph: CommerceIntelligenceGraph): MarketSignal[] {
  const signals: MarketSignal[] = [];
  const validated = graph.offers.filter((o) => o.validation_status === "validated");
  const prices = validated.map((o) => o.price).filter((p) => p > 0);

  if (prices.length >= 2) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const spread = max > 0 ? (max - min) / max : 0;

    if (spread > 0.35) {
      signals.push({
        kind: "unusual_price_shift",
        severity: "warning",
        message: `Cross-retailer prices span ${Math.round(spread * 100)}% — verify model and condition.`,
        retailers: validated.map((o) => o.retailer_name),
      });
    }

    if (spread < 0.05 && validated.length >= 2) {
      signals.push({
        kind: "synchronized_pricing",
        severity: "info",
        message: "Prices cluster tightly — possible MAP pricing or synchronized offers.",
        retailers: validated.map((o) => o.retailer_name),
      });
    }
  }

  for (const o of validated) {
    if (o.was_price != null && o.was_price > o.price) {
      const pct = ((o.was_price - o.price) / o.was_price) * 100;
      if (pct >= 35) {
        signals.push({
          kind: "suspicious_discount",
          severity: "warning",
          message: `${o.retailer_name} shows ${Math.round(pct)}% was-price discount — verify authenticity.`,
          retailers: [o.retailer_name],
        });
      } else if (pct >= 15) {
        signals.push({
          kind: "sale_spike",
          severity: "info",
          message: `${o.retailer_name} promotional pricing (${Math.round(pct)}% off was price).`,
          retailers: [o.retailer_name],
        });
      }
    }

    if (o.freshness_tier === "stale") {
      signals.push({
        kind: "outlier_behavior",
        severity: "info",
        message: `${o.retailer_name} offer data may be stale.`,
        retailers: [o.retailer_name],
      });
    }
  }

  return signals;
}
