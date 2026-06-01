/**
 * Consumer-facing copy — never expose scrape/persist/normalization internals.
 */

const NOTE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/verified persisted inventory/i, "Recently verified price"],
  [/price scraped from live product page/i, "Verified live price"],
  [/scraped from live product page/i, "Verified live price"],
  [/price from retailer page · verify at checkout/i, "Live retailer pricing"],
  [/price extracted from pdp/i, "Verified live price"],
  [/price from amazon pa-api · refreshed overnight/i, "Recently verified from Amazon"],
  [/live price$/i, "Verified live price"],
  [/recent price$/i, "Recently verified"],
];

export function consumerPriceNote(note?: string): string | undefined {
  if (!note?.trim()) return undefined;
  let out = note.trim();
  for (const [re, replacement] of NOTE_REPLACEMENTS) {
    if (re.test(out)) {
      out = replacement;
      break;
    }
  }
  if (/scraped|persist|normaliz|pa-api|pdp|index|pipeline|manual qa/i.test(out)) {
    return "Verified live price";
  }
  return out;
}

export function consumerVerificationAgeLabel(mins: number | null | undefined): string | null {
  if (mins == null) return null;
  if (mins < 1) return "Verified just now";
  if (mins < 60) return `Verified ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `Verified ${hrs}h ago`;
}

export function isInternalConfidenceReason(message: string): boolean {
  return /scraped|persist|normaliz|pipeline|pdp|index|pa-api|bulk-rejected|catalog.drift/i.test(
    message,
  );
}

export function consumerConfidenceReason(message: string): string | null {
  if (isInternalConfidenceReason(message)) return null;
  return message;
}
