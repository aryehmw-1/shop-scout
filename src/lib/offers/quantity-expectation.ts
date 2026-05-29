/**
 * Consumer-facing quantity interpretation and "would this mislead?" warnings.
 */

import type { CatalogItem } from "../retailers/catalog";
import {
  extractPackCount,
  normalizeAmazonListingPrice,
  type AmazonPriceNormalization,
} from "../offers/amazon-normalization";

export interface QuantityExpectationAnalysis {
  catalogSizeLabel: string;
  catalogPackAssumption: number;
  titlePackExtracted: number;
  consumerQuantityLabel: string;
  normalization: AmazonPriceNormalization | null;
  unitPriceUsd: number;
  rawPriceUsd: number;
  priceRatioVsCatalog: number;
  wouldMisleadConsumer: boolean;
  warnings: string[];
}

function catalogPackFromSize(size?: string): number {
  if (!size) return 1;
  const m = size.match(/(\d+)\s*(?:ct|count|pk|pack)/i);
  if (m?.[1]) {
    const n = parseInt(m[1], 10);
    if (n >= 2 && n <= 48) return n;
  }
  return 1;
}

function buildConsumerLabel(
  packCount: number,
  catalogSize: string,
  method: string,
): string {
  if (method === "pack-count" || method === "inferred-pack") {
    return `${packCount}-pack · per-unit normalized price shown`;
  }
  if (packCount > 1 && catalogPackFromSize(catalogSize) === 1) {
    return `Listing may be ${packCount}-count · verify quantity at checkout`;
  }
  return catalogSize || "single unit";
}

export function analyzeQuantityExpectation(
  item: CatalogItem,
  storeTitle: string,
  persistedPriceUsd: number,
): QuantityExpectationAnalysis {
  const catalogPack = catalogPackFromSize(item.size);
  const titlePack = extractPackCount(storeTitle, item.size);
  const norm = normalizeAmazonListingPrice(persistedPriceUsd, storeTitle, item);
  const ratio =
    item.basePrice > 0 ? persistedPriceUsd / item.basePrice : 0;

  const warnings: string[] = [];
  let wouldMislead = false;

  if (titlePack > 1 && catalogPack === 1 && norm?.method === "direct") {
    warnings.push(
      `Title suggests ${titlePack}-count but price was accepted as single-unit (direct match)`,
    );
    wouldMislead = true;
  }

  if (titlePack >= 12 && catalogPack <= 1) {
    warnings.push(
      `High pack count (${titlePack}) vs single-unit catalog baseline — verify this is not a bulk listing`,
    );
    wouldMislead = true;
  }

  if (titlePack !== catalogPack && titlePack > 1 && catalogPack > 1) {
    warnings.push(
      `Title pack (${titlePack}) differs from catalog size assumption (${catalogPack})`,
    );
  }

  if (ratio > 1.8 || ratio < 0.45) {
    warnings.push(`Price ratio ${ratio.toFixed(2)} vs catalog may surprise shoppers`);
    if (ratio > 2.2) wouldMislead = true;
  }

  if (norm && !norm.accepted) {
    warnings.push(`Normalization rejected: ${norm.reason}`);
    wouldMislead = true;
  }

  const effectivePack = norm?.packCount ?? titlePack;
  const consumerQuantityLabel = buildConsumerLabel(
    effectivePack,
    item.size,
    norm?.method ?? "direct",
  );

  return {
    catalogSizeLabel: item.size,
    catalogPackAssumption: catalogPack,
    titlePackExtracted: titlePack,
    consumerQuantityLabel,
    normalization: norm,
    unitPriceUsd: norm?.accepted ? norm.normalizedPrice : persistedPriceUsd,
    rawPriceUsd: persistedPriceUsd,
    priceRatioVsCatalog: Math.round(ratio * 100) / 100,
    wouldMisleadConsumer: wouldMislead,
    warnings,
  };
}

export function formatQuantityWarnings(analysis: QuantityExpectationAnalysis): string {
  if (!analysis.warnings.length) return "Quantity interpretation looks reasonable for a typical shopper.";
  return analysis.warnings.join(" · ");
}
