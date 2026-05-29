import type { CatalogItem } from "../retailers/catalog";
import type { ProductSearchResults, ShoppingIntent } from "../types";
import { applyHistoricalPrices } from "./price-prediction";
import { recordPriceSnapshots } from "./price-history";

/**
 * After catalog + live APIs: apply history model, then optionally log snapshots.
 */
export async function finalizePricesWithHistory(
  catalogId: string,
  results: ProductSearchResults,
  options: { recordSnapshot?: boolean; snapshotSource?: string } = {},
): Promise<ProductSearchResults> {
  let out = await applyHistoricalPrices(catalogId, results);

  if (options.recordSnapshot) {
    await recordPriceSnapshots(
      catalogId,
      out,
      options.snapshotSource ?? "nightly_index",
    );
  }

  return out;
}

export function shouldUseHistoricalModel(
  intent: ShoppingIntent,
  options?: { skipHistory?: boolean },
): boolean {
  if (options?.skipHistory) return false;
  return process.env.PRICE_HISTORY_MODEL !== "off";
}
