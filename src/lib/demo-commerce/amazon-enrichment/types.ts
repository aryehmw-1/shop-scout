/** Cached Amazon metadata for a catalog/search candidate (PA-API enrichment layer). */
export interface AmazonEnrichmentEntry {
  cacheKey: string;
  /** Normalized search query sent to Amazon */
  query: string;
  candidateTitle: string;
  candidateBrand?: string;
  asin?: string;
  amazonTitle?: string;
  imageUrl?: string;
  pdpUrl?: string;
  price?: number;
  /** Raw classification / browse hint from PA-API */
  categoryHint?: string;
  /** 0–1 title similarity (candidate vs Amazon) */
  matchScore: number;
  /** 0–1 composite enrichment confidence */
  enrichmentConfidence: number;
  fetchedAt: string;
  source: "paapi" | "cache";
  rejected?: boolean;
  rejectReason?: string;
}

export interface AmazonEnrichmentCacheFile {
  version: 1;
  updatedAt: string;
  entries: Record<string, AmazonEnrichmentEntry>;
}

export interface EnrichCandidateInput {
  id: string;
  title: string;
  brand?: string;
  category?: string;
  basePrice?: number;
}

export const ENRICHMENT_MIN_MATCH_SCORE = 0.38;
export const ENRICHMENT_MIN_CONFIDENCE = 0.55;
export const DEFAULT_THROTTLE_MS = 1200;
