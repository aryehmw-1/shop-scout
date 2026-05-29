import type { ProductOffer, ProductSearchResults, RetailerId } from "../types";
import { averagePriceFromHistory } from "./price-average";
import type { HistoryPoint } from "./price-history";
import { loadAllPriceHistory, loadPriceHistory } from "./price-history";

export interface PredictedPrice {
  priceUsd: number;
  confidence: number;
  sampleCount: number;
  method: "daily_average" | "insufficient_data";
  priceNote: string;
}

/** @deprecated Use averagePriceFromHistory — kept for type compatibility */
export function predictPriceFromHistory(
  points: HistoryPoint[],
): PredictedPrice | null {
  const avg = averagePriceFromHistory(points);
  if (!avg) return null;
  return {
    priceUsd: avg.priceUsd,
    confidence: avg.confidence,
    sampleCount: avg.sampleCount,
    method: "daily_average",
    priceNote: avg.priceNote,
  };
}

export async function applyHistoricalPrices(
  catalogId: string,
  results: ProductSearchResults,
): Promise<ProductSearchResults> {
  const historyByRetailer = await loadAllPriceHistory(catalogId);

  const patch = (offers: ProductOffer[]) =>
    offers.map((o) => {
      if (
        o.priceSource === "connector_api" ||
        o.priceSource === "nightly_index" ||
        o.priceSource === "daily_index" ||
        o.priceSource === "cached_quote"
      ) {
        return o;
      }

      const history =
        historyByRetailer.get(`${o.retailer}:${o.channel}`) ?? [];
      const avg = averagePriceFromHistory(history);
      if (!avg || avg.confidence < 0.55) return o;

      const imageUrl =
        avg.latestImageUrl?.startsWith("https://") ?
          avg.latestImageUrl
        : o.imageUrl;

      return {
        ...o,
        price: avg.priceUsd,
        landedCost: avg.priceUsd,
        unitPrice: avg.priceUsd,
        priceSource: "historical_model" as const,
        priceNote: avg.priceNote,
        matchConfidence: Math.max(o.matchConfidence, avg.confidence),
        storeTitle: avg.latestStoreTitle ?? o.storeTitle,
        imageUrl,
        imageSource: imageUrl ? o.imageSource : o.imageSource,
      };
    });

  return {
    ...results,
    local: patch(results.local),
    online: patch(results.online),
  };
}

export async function getRetailerForecast(
  catalogId: string,
  retailerId: RetailerId,
): Promise<PredictedPrice | null> {
  const history = await loadPriceHistory(catalogId, retailerId);
  return predictPriceFromHistory(history);
}
