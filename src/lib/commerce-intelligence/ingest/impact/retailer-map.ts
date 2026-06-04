import type { RetailerId } from "@/lib/types";

const DOMAIN_TO_RETAILER: Array<{ pattern: RegExp; retailer: RetailerId }> = [
  { pattern: /walmart\.com/i, retailer: "walmart" },
  { pattern: /target\.com/i, retailer: "target" },
  { pattern: /amazon\.com/i, retailer: "amazon" },
  { pattern: /costco\.com/i, retailer: "costco" },
  { pattern: /kroger\.com/i, retailer: "kroger" },
  { pattern: /macys\.com/i, retailer: "macys" },
  { pattern: /kohls\.com/i, retailer: "kohls" },
  { pattern: /nike\.com/i, retailer: "nike" },
  { pattern: /gap\.com/i, retailer: "gap" },
  { pattern: /oldnavy\.com/i, retailer: "oldnavy" },
  { pattern: /aldi\.com/i, retailer: "aldi" },
];

const VALID_RETAILERS = new Set<string>([
  "walmart",
  "target",
  "amazon",
  "costco",
  "kroger",
  "macys",
  "kohls",
  "nike",
  "gap",
  "oldnavy",
  "aldi",
]);

export function retailerFromUrl(url: string): { retailer: RetailerId; domain: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    for (const { pattern, retailer } of DOMAIN_TO_RETAILER) {
      if (pattern.test(host)) {
        if (!VALID_RETAILERS.has(retailer)) return null;
        return { retailer, domain: host };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function slugifyId(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
