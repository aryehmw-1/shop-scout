import { retailerIdFromProductUrl } from "../matching/url-parser";
import type { ProductOffer, RetailerId } from "../types";
import {
  classifyProductUrl,
  isPdpProductUrl,
  isSearchProductUrl,
} from "./url-classifier";
import { attachPipelineDebug } from "./offer-pipeline-meta";

const VALIDATE_TIMEOUT_MS = 8_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; ShopScout/1.0; +https://shop-scout-one.vercel.app)";

export interface UrlValidationResult {
  ok: boolean;
  httpStatus?: number;
  finalUrl?: string;
  reason?: string;
  urlKind?: ReturnType<typeof classifyProductUrl>;
}

export async function validateOfferProductUrl(
  url: string,
  retailerId: RetailerId,
): Promise<UrlValidationResult> {
  if (!url.startsWith("https://")) {
    return { ok: false, reason: "not_https" };
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  const parsedRetailer = retailerIdFromProductUrl(url);
  if (parsedRetailer && parsedRetailer !== retailerId) {
    return { ok: false, reason: "retailer_domain_mismatch" };
  }

  if (isSearchProductUrl(url)) {
    return {
      ok: false,
      reason: "search_url_not_pdp",
      finalUrl: url,
      urlKind: "search",
    };
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(VALIDATE_TIMEOUT_MS),
    });

    const finalUrl = res.url || url;
    const kind = classifyProductUrl(finalUrl);
    const finalRetailer = retailerIdFromProductUrl(finalUrl);

    if (finalRetailer && finalRetailer !== retailerId) {
      return {
        ok: false,
        httpStatus: res.status,
        finalUrl,
        reason: "redirect_wrong_retailer",
        urlKind: kind,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        finalUrl,
        reason: `http_${res.status}`,
        urlKind: kind,
      };
    }

    if (!isPdpProductUrl(finalUrl)) {
      return {
        ok: false,
        httpStatus: res.status,
        finalUrl,
        reason: "not_canonical_pdp",
        urlKind: kind,
      };
    }

    return {
      ok: true,
      httpStatus: res.status,
      finalUrl,
      urlKind: kind,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return { ok: false, reason: msg.slice(0, 80) };
  }
}

export function urlValidationEnabled(): boolean {
  const raw = process.env.VALIDATE_OFFER_URLS?.trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return false;
  if (raw === "on" || raw === "true" || raw === "1") return true;
  return process.env.NODE_ENV === "production";
}

export async function validateAndFixOfferUrl(
  offer: ProductOffer,
): Promise<ProductOffer> {
  if (!urlValidationEnabled()) {
    return attachPipelineDebug(offer, {
      validationStatus: "skipped",
      urlValidation: { ok: true, reason: "validation_disabled" },
    });
  }

  const result = await validateOfferProductUrl(offer.productUrl, offer.retailer);
  let o = attachPipelineDebug(offer, {
    validationStatus: result.ok ? "ok" : "rejected",
    rejectedReason: result.ok ? offer.pipelineDebug?.rejectedReason : result.reason,
    urlValidation: {
      ok: result.ok,
      httpStatus: result.httpStatus,
      finalUrl: result.finalUrl,
      reason: result.reason,
    },
  });

  if (result.ok && result.finalUrl && result.finalUrl !== offer.productUrl) {
    o = { ...o, productUrl: result.finalUrl };
  }

  if (!result.ok && isSearchProductUrl(offer.productUrl)) {
    o = {
      ...o,
      priceNote: o.priceNote ?? "Search link — open store to find product",
    };
  }

  return o;
}
