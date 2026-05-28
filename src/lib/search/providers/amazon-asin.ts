export function parseAmazonAsin(url: string): string | undefined {
  const m = url.match(/\/(?:dp|gp\/product|exec\/obidos\/ASIN)\/([A-Z0-9]{10})/i);
  return m?.[1]?.toUpperCase();
}
