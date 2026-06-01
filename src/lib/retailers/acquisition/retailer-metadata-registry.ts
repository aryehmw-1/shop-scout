/**
 * Retailer metadata for partnerships, affiliate programs, and compliance.
 * Positions the platform as commerce intelligence — not a scraping stack.
 */
import type { RetailerId } from "../../types";
import type { AcquisitionMethod } from "./types";

export type RetailerPartnershipTier = "official" | "affiliate" | "feed" | "public" | "research";

export interface AffiliateProgramDescriptor {
  programName: string;
  configured: boolean;
  envKeys: string[];
  attributionSupported: boolean;
  clickTrackingPath: string;
}

export interface RetailerCompliancePolicy {
  allowScraping: boolean;
  requiresOfficialApi: boolean;
  notes: string;
}

export interface RetailerMetadata {
  retailerId: RetailerId;
  displayName: string;
  partnershipTier: RetailerPartnershipTier;
  /** Preferred official acquisition methods in priority order. */
  preferredMethods: AcquisitionMethod[];
  affiliate: AffiliateProgramDescriptor;
  compliance: RetailerCompliancePolicy;
  /** Business priority for engineering investment. */
  businessPriority: "core" | "standard" | "experimental";
  officialApiAvailable: boolean;
  feedIngestionReady: boolean;
}

function affiliateDescriptor(
  retailer: RetailerId,
  programName: string,
  envKey: string,
): AffiliateProgramDescriptor {
  const configured = Boolean(process.env[envKey]?.trim());
  return {
    programName,
    configured,
    envKeys: [envKey],
    attributionSupported: true,
    clickTrackingPath: "/api/outbound",
  };
}

const METADATA: Partial<Record<RetailerId, RetailerMetadata>> = {
  amazon: {
    retailerId: "amazon",
    displayName: "Amazon",
    partnershipTier: "official",
    preferredMethods: ["official_api", "affiliate_feed", "cached_structured", "http_lightweight"],
    affiliate: affiliateDescriptor("amazon", "Amazon Associates", "AFFILIATE_AMAZON_TAG"),
    compliance: {
      allowScraping: false,
      requiresOfficialApi: true,
      notes: "PA-API / Associates preferred; HTML scrape is fallback only.",
    },
    businessPriority: "core",
    officialApiAvailable: true,
    feedIngestionReady: false,
  },
  target: {
    retailerId: "target",
    displayName: "Target",
    partnershipTier: "affiliate",
    preferredMethods: ["affiliate_feed", "cached_structured", "http_lightweight", "browser_rendered"],
    affiliate: affiliateDescriptor("target", "Target Partners", "AFFILIATE_TARGET_TAG"),
    compliance: {
      allowScraping: true,
      requiresOfficialApi: false,
      notes: "Affiliate + structured extraction; rendered fetch as escalation.",
    },
    businessPriority: "standard",
    officialApiAvailable: false,
    feedIngestionReady: false,
  },
  walmart: {
    retailerId: "walmart",
    displayName: "Walmart",
    partnershipTier: "research",
    preferredMethods: ["cached_structured", "merchant_feed", "http_lightweight"],
    affiliate: affiliateDescriptor("walmart", "Walmart Affiliates", "AFFILIATE_WALMART_TAG"),
    compliance: {
      allowScraping: true,
      requiresOfficialApi: false,
      notes: "Experimental/research tier. Browser-rendered fallback only; not core business path.",
    },
    businessPriority: "experimental",
    officialApiAvailable: false,
    feedIngestionReady: false,
  },
};

export function getRetailerMetadata(retailerId: RetailerId): RetailerMetadata {
  return (
    METADATA[retailerId] ?? {
      retailerId,
      displayName: retailerId,
      partnershipTier: "public",
      preferredMethods: ["cached_structured", "http_lightweight"],
      affiliate: affiliateDescriptor(retailerId, "Generic", `AFFILIATE_${retailerId.toUpperCase()}_TAG`),
      compliance: { allowScraping: true, requiresOfficialApi: false, notes: "Default public retailer policy." },
      businessPriority: "standard",
      officialApiAvailable: false,
      feedIngestionReady: false,
    }
  );
}

export function listRetailerMetadata(): RetailerMetadata[] {
  return Object.values(METADATA).filter(Boolean) as RetailerMetadata[];
}

/** Canonical acquisition method priority (global hierarchy). */
export const ACQUISITION_METHOD_PRIORITY: AcquisitionMethod[] = [
  "official_api",
  "affiliate_feed",
  "merchant_feed",
  "public_structured",
  "cached_structured",
  "http_lightweight",
  "browser_rendered",
];

export function orderMethodsByPriority(
  methods: AcquisitionMethod[],
  preferred: AcquisitionMethod[],
): AcquisitionMethod[] {
  const rank = (m: AcquisitionMethod) => {
    const pi = preferred.indexOf(m);
    if (pi >= 0) return pi;
    const gi = ACQUISITION_METHOD_PRIORITY.indexOf(m);
    return 100 + gi;
  };
  return [...methods].sort((a, b) => rank(a) - rank(b));
}
