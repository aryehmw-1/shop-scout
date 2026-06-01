/**
 * Affiliate integration abstraction — official partnership readiness.
 */
import type { RetailerId } from "../types";
import { buildAffiliateUrl } from "../affiliate";

export interface AffiliateClickEvent {
  retailerId: RetailerId;
  productUrl: string;
  affiliateUrl: string;
  sessionId?: string;
  searchQuery?: string;
  catalogId?: string;
  ts: string;
}

export interface AffiliateIntegrationStatus {
  retailerId: RetailerId;
  programConfigured: boolean;
  attributionSupported: boolean;
  clickTrackingPath: string;
  sampleAffiliateUrl?: string;
}

const PROGRAM_ENV: Partial<Record<RetailerId, string>> = {
  amazon: "AFFILIATE_AMAZON_TAG",
  target: "AFFILIATE_TARGET_TAG",
  walmart: "AFFILIATE_WALMART_TAG",
  kroger: "AFFILIATE_KROGER_TAG",
  costco: "AFFILIATE_COSTCO_TAG",
};

export function isAffiliateConfigured(retailerId: RetailerId): boolean {
  const key = PROGRAM_ENV[retailerId];
  return Boolean(key && process.env[key]?.trim());
}

export function buildTrackedAffiliateUrl(
  retailerId: RetailerId,
  productUrl: string,
): string {
  return buildAffiliateUrl(retailerId, productUrl);
}

export function getAffiliateStatus(
  retailerId: RetailerId,
  sampleProductUrl?: string,
): AffiliateIntegrationStatus {
  const configured = isAffiliateConfigured(retailerId);
  const sampleAffiliateUrl =
    configured && sampleProductUrl ?
      buildTrackedAffiliateUrl(retailerId, sampleProductUrl)
    : undefined;

  return {
    retailerId,
    programConfigured: configured,
    attributionSupported: true,
    clickTrackingPath: "/api/outbound",
    sampleAffiliateUrl,
  };
}

export function listAffiliateStatuses(retailers: RetailerId[]): AffiliateIntegrationStatus[] {
  return retailers.map((r) => getAffiliateStatus(r));
}
