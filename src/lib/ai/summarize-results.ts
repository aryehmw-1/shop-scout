import type { ProductSearchResults } from "../types";

function topOffers(
  offers: ProductSearchResults["online"],
  n: number,
): string[] {
  return offers.slice(0, n).map(
    (o) =>
      `${o.retailerName}: $${o.price.toFixed(2)} — ${o.storeTitle ?? o.title}${o.isBestDeal ? " (best deal)" : ""}`,
  );
}

function offersForLinkCompare(results: ProductSearchResults) {
  const ref = results.referenceProduct?.title.toLowerCase() ?? "";
  const refTokens = ref
    .split(/\s+/)
    .filter((t) => t.length > 3 && !["pack", "womens", "women", "mens", "medium"].includes(t));

  const online = results.online;
  if (!ref || refTokens.length === 0) return online;

  const matching = online.filter((o) => {
    const blob = `${o.title} ${o.storeTitle ?? ""}`.toLowerCase();
    return refTokens.some((t) => blob.includes(t));
  });

  return matching.length > 0 ? matching : online;
}

/** Compact facts for the AI — never invent beyond this */
export function summarizeSearchResults(results: ProductSearchResults): string {
  const lines: string[] = [
    `ZIP code (shipping): ${results.zipCode}`,
    `Online offers: ${results.online.length}`,
  ];

  if (results.referenceProduct) {
    lines.push(
      `User's link product: "${results.referenceProduct.title}" ~$${results.referenceProduct.referencePrice.toFixed(2)}`,
    );
    lines.push(
      "Compare prices for the LINK product above — do not substitute a different item (e.g. socks if they linked a sweater).",
    );
  }

  const comparePool =
    results.referenceProduct ? offersForLinkCompare(results) : results.online;

  const bestOnline = comparePool[0];
  if (bestOnline) {
    lines.push(
      `Cheapest online: ${bestOnline.retailerName} $${bestOnline.price.toFixed(2)} (${bestOnline.storeTitle ?? bestOnline.title})`,
    );
  }

  const onlineTop = topOffers(comparePool, 4);
  if (onlineTop.length) {
    lines.push("Online sample:", ...onlineTop.map((l) => `  - ${l}`));
  }

  return lines.join("\n");
}
