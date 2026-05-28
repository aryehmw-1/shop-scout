import type { ProductSearchResults } from "../types";

function topOffers(
  offers: ProductSearchResults["local"],
  n: number,
): string[] {
  return offers.slice(0, n).map(
    (o) =>
      `${o.retailerName}: $${o.price.toFixed(2)} — ${o.storeTitle ?? o.title}${o.isBestDeal ? " (best deal)" : ""}`,
  );
}

/** Compact facts for the AI — never invent beyond this */
export function summarizeSearchResults(results: ProductSearchResults): string {
  const lines: string[] = [
    `ZIP code: ${results.zipCode}`,
    `Nearby offers: ${results.local.length}`,
    `Online offers: ${results.online.length}`,
  ];

  if (results.referenceProduct) {
    lines.push(
      `User's link product: "${results.referenceProduct.title}" ~$${results.referenceProduct.referencePrice.toFixed(2)}`,
    );
  }

  const bestLocal = results.local[0];
  const bestOnline = results.online[0];
  if (bestLocal) {
    lines.push(
      `Cheapest nearby: ${bestLocal.retailerName} $${bestLocal.price.toFixed(2)} (${bestLocal.storeTitle ?? bestLocal.title})`,
    );
  }
  if (bestOnline) {
    lines.push(
      `Cheapest online: ${bestOnline.retailerName} $${bestOnline.price.toFixed(2)} (${bestOnline.storeTitle ?? bestOnline.title})`,
    );
  }

  const localTop = topOffers(results.local, 4);
  if (localTop.length) {
    lines.push("Nearby sample:", ...localTop.map((l) => `  - ${l}`));
  }
  const onlineTop = topOffers(results.online, 4);
  if (onlineTop.length) {
    lines.push("Online sample:", ...onlineTop.map((l) => `  - ${l}`));
  }

  return lines.join("\n");
}
