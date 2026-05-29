import type { ProductOffer } from "../types";
import { classifyProductUrl } from "./url-classifier";

export interface OfferDiagnosticRow {
  retailer: string;
  channel: string;
  urlKind: string;
  productUrl: string;
  imageUrl: string;
  price: number;
  priceSource: string;
  matchConfidence: number;
  identityConfidence?: number;
  priceConfidence?: number;
  confidenceReasons: string;
  imageSource?: string;
  notes: string;
}

export function offerDiagnosticsEnabled(): boolean {
  const raw = process.env.INDEX_OFFER_DIAGNOSTICS?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

export function buildOfferDiagnostic(offer: ProductOffer): OfferDiagnosticRow {
  const reasons =
    offer.confidenceReasons?.map((r) => r.code).join(", ") ?? "";
  const urlKind = classifyProductUrl(offer.productUrl);
  const notes: string[] = [];
  if (urlKind === "search") notes.push("search-not-pdp");
  if ((offer.matchConfidence ?? 0) < 0.58) notes.push("low-confidence");

  return {
    retailer: offer.retailer,
    channel: offer.channel,
    urlKind,
    productUrl: offer.productUrl.slice(0, 120),
    imageUrl: (offer.imageUrl ?? "").slice(0, 100),
    price: offer.price,
    priceSource: offer.priceSource ?? "unknown",
    matchConfidence: Math.round((offer.matchConfidence ?? 0) * 100) / 100,
    identityConfidence: offer.identityConfidence,
    priceConfidence: offer.priceConfidence,
    confidenceReasons: reasons,
    imageSource: offer.imageSource,
    notes: notes.join("; "),
  };
}

export function logOfferDiagnostics(
  catalogId: string,
  rows: OfferDiagnosticRow[],
  summary?: Record<string, unknown>,
): void {
  if (!offerDiagnosticsEnabled()) return;
  console.log(
    `[offer-diagnostics] ${catalogId}`,
    JSON.stringify({ summary, sample: rows.slice(0, 12) }, null, 0),
  );
}

export interface ImageFetchSkipLog {
  retailer: string;
  reason: string;
  productUrl: string;
}

export function logImageFetchSkips(
  catalogId: string,
  skips: ImageFetchSkipLog[],
): void {
  if (!offerDiagnosticsEnabled() || !skips.length) return;
  console.log(
    `[image-fetch-skips] ${catalogId}`,
    JSON.stringify(skips.slice(0, 20)),
  );
}
