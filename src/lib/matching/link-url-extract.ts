import { parseAmazonAsin } from "../search/providers/amazon-asin";
import type { RetailerId } from "../types";
import { retailerIdFromProductUrl } from "./url-parser";

export interface UrlExternalIds {
  asin?: string;
  walmartId?: string;
  targetTcin?: string;
  costcoItem?: string;
}

export function extractExternalIdsFromUrl(url: string): UrlExternalIds {
  const ids: UrlExternalIds = {};
  const asin = parseAmazonAsin(url);
  if (asin) ids.asin = asin;

  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);

    if (retailerIdFromProductUrl(url) === "walmart") {
      const ipIdx = parts.indexOf("ip");
      if (ipIdx >= 0 && parts[ipIdx + 1] && /^\d+$/.test(parts[ipIdx + 1]!)) {
        ids.walmartId = parts[ipIdx + 1];
      }
    }

    if (retailerIdFromProductUrl(url) === "target") {
      const aIdx = parts.indexOf("A-");
      const tcinSeg = parts.find((p) => /^A-\d+/.test(p));
      if (tcinSeg) ids.targetTcin = tcinSeg.replace(/^A-/, "");
      const preIdx = parts.indexOf("preselect");
      if (preIdx >= 0 && parts[preIdx + 1]) {
        ids.targetTcin = parts[preIdx + 1]!.replace(/\D/g, "");
      }
    }

    if (retailerIdFromProductUrl(url) === "costco") {
      const dotIdx = parts.findIndex((p) => p.endsWith(".product"));
      if (dotIdx >= 0 && parts[dotIdx + 1]) {
        ids.costcoItem = parts[dotIdx + 1];
      }
    }
  } catch {
    /* ignore */
  }

  return ids;
}

export function isCoreLinkRetailer(retailerId?: RetailerId): boolean {
  return (
    retailerId === "amazon" ||
    retailerId === "walmart" ||
    retailerId === "target" ||
    retailerId === "costco" ||
    retailerId === "kroger"
  );
}
