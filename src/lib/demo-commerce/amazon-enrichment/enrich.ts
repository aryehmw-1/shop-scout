import { isAmazonPaapiConfigured } from "../../search/providers/amazon-paapi-config";
import {
  enrichmentCacheKey,
  normalizeEnrichmentTitle,
} from "./normalize";
import { searchAmazonForEnrichment } from "./paapi";
import {
  getCachedEnrichment,
  saveEnrichmentEntry,
} from "./cache";
import {
  enrichmentConfidence,
  isWeakAmazonMatch,
  titleSimilarity,
} from "./similarity";
import type {
  AmazonEnrichmentEntry,
  EnrichCandidateInput,
} from "./types";
import {
  ENRICHMENT_MIN_CONFIDENCE,
  ENRICHMENT_MIN_MATCH_SCORE,
  DEFAULT_THROTTLE_MS,
} from "./types";

export interface EnrichOneOptions {
  cacheOnly?: boolean;
  throttleMs?: number;
  skipFetch?: boolean;
}

let lastFetchAt = 0;

async function throttle(ms: number): Promise<void> {
  const elapsed = Date.now() - lastFetchAt;
  if (elapsed < ms) {
    await new Promise((r) => setTimeout(r, ms - elapsed));
  }
  lastFetchAt = Date.now();
}

function pickBestHit(
  candidate: EnrichCandidateInput,
  hits: Awaited<ReturnType<typeof searchAmazonForEnrichment>>,
): (typeof hits)[0] | null {
  const queryTitle = normalizeEnrichmentTitle(candidate.title, candidate.brand);
  let best: { hit: (typeof hits)[0]; score: number } | null = null;

  for (const hit of hits) {
    const score = titleSimilarity(queryTitle, hit.title);
    if (isWeakAmazonMatch(queryTitle, hit.title, score)) continue;
    if (!best || score > best.score) best = { hit, score };
  }

  return best && best.score >= ENRICHMENT_MIN_MATCH_SCORE ? best.hit : null;
}

export async function enrichCandidate(
  candidate: EnrichCandidateInput,
  opts: EnrichOneOptions = {},
): Promise<AmazonEnrichmentEntry | null> {
  const cacheKey = enrichmentCacheKey(candidate.title, candidate.brand);
  const query = normalizeEnrichmentTitle(candidate.title, candidate.brand);

  const cached = getCachedEnrichment(cacheKey);
  if (cached && (opts.cacheOnly || opts.skipFetch)) {
    return cached.enrichmentConfidence >= ENRICHMENT_MIN_CONFIDENCE ? cached : null;
  }
  if (opts.cacheOnly) return null;

  if (!cached && !isAmazonPaapiConfigured()) {
    return null;
  }

  if (!cached) {
    await throttle(opts.throttleMs ?? DEFAULT_THROTTLE_MS);
    const hits = await searchAmazonForEnrichment(query, 5);
    const best = pickBestHit(candidate, hits);

    if (!best) {
      const rejected: AmazonEnrichmentEntry = {
        cacheKey,
        query,
        candidateTitle: candidate.title,
        candidateBrand: candidate.brand,
        matchScore: 0,
        enrichmentConfidence: 0,
        fetchedAt: new Date().toISOString(),
        source: "paapi",
        rejected: true,
        rejectReason: hits.length ? "weak_match" : "no_results",
      };
      saveEnrichmentEntry(rejected);
      return null;
    }

    const matchScore = titleSimilarity(query, best.title);
    const confidence = enrichmentConfidence({
      matchScore,
      hasImage: Boolean(best.imageUrl?.includes("media-amazon")),
      hasPdp: Boolean(best.pdpUrl),
      hasPrice: best.price != null,
    });

    const entry: AmazonEnrichmentEntry = {
      cacheKey,
      query,
      candidateTitle: candidate.title,
      candidateBrand: candidate.brand,
      asin: best.asin,
      amazonTitle: best.title,
      imageUrl: best.imageUrl,
      pdpUrl: best.pdpUrl,
      price: best.price,
      categoryHint: best.categoryHint ?? candidate.category,
      matchScore,
      enrichmentConfidence: confidence,
      fetchedAt: new Date().toISOString(),
      source: "paapi",
    };

    if (confidence < ENRICHMENT_MIN_CONFIDENCE) {
      saveEnrichmentEntry({
        ...entry,
        rejected: true,
        rejectReason: "low_confidence",
      });
      return null;
    }

    saveEnrichmentEntry(entry);
    return entry;
  }

  return cached.enrichmentConfidence >= ENRICHMENT_MIN_CONFIDENCE ? cached : null;
}

export function isAmazonEnrichmentAvailable(): boolean {
  return isAmazonPaapiConfigured();
}
