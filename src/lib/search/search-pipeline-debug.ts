/**
 * Structured end-to-end search pipeline trace for debugging empty results.
 */

import { CATALOG } from "../retailers/catalog";
import { parseQueryAttributes, scoreItem } from "../retailers/search";
import { extractIntentFromMessage } from "../ai/extract-intent";
import { suggestCatalogProducts, normalizeSearchQuery } from "./query-normalize";
import { resolvePrimaryProduct } from "./product-resolver";
import { loadPersistedLiveQuotes } from "../inventory/verified-inventory-resolver";
import type { VerifiedInventoryResolution } from "../inventory/verified-inventory-resolver";
import { fetchLiveQuotes } from "./fetch-live-quotes";
import { compareProduct, searchCatalog } from "../retailers/catalog";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, ProductSearchResults, ShoppingIntent } from "../types";
import { isVerifiedOffer } from "../offers/offer-trust";
import { isDisplayableOffer } from "../offers/offer-persist-validation";
import { passesConsumerTrustGates } from "../offers/consumer-trust";
import { computeOfferRankScore } from "../offers/offer-ranking";
import { getRetailerTrustScores } from "../pricing/retailer-quality-store";

export interface SearchPipelineStage {
  stage: string;
  count: number;
  detail?: string;
  samples?: string[];
}

export interface OfferFilterReason {
  offerId: string;
  retailer: string;
  price: number;
  priceSource?: string;
  matchConfidence?: number;
  reasons: string[];
}

export interface SearchPipelineTrace {
  query: string;
  resolvedCatalogId: string;
  resolvedTitle: string;
  matchReason: string;
  synthetic: boolean;
  stages: SearchPipelineStage[];
  filterReasons: OfferFilterReason[];
  retailerHealth: Array<{
    retailerId: string;
    trustScore: number;
  }>;
  keywordFallbackUsed: boolean;
  semanticNote: string;
  verifiedInventoryResolution?: import("../types").VerifiedInventoryHitMeta;
}

function whyNotDisplayable(offer: ProductOffer): string[] {
  const reasons: string[] = [];
  if (offer.matchBand) reasons.push(`match_band:${offer.matchBand}`);
  if (offer.matchDisplayLabel) reasons.push(offer.matchDisplayLabel);
  if ((offer.matchConfidence ?? 0) < 0.58) reasons.push("low_match_confidence");
  if (offer.priceSource === "catalog_model") reasons.push("catalog_estimate");
  if (!isVerifiedOffer(offer)) reasons.push("not_verified_offer");
  if (!passesConsumerTrustGates(offer)) {
    if ((offer.matchConfidence ?? 0) < 0.72) reasons.push("consumer_match_below_0.72");
    if ((offer.identityConfidence ?? offer.matchConfidence ?? 0) < 0.65) {
      reasons.push("identity_below_0.65");
    }
    if (!offer.imageUrl?.startsWith("https://")) reasons.push("missing_image");
    else reasons.push("consumer_trust_failed");
  }
  if (offer.pipelineDebug?.rejectedReason) {
    reasons.push(String(offer.pipelineDebug.rejectedReason));
  }
  const rank = computeOfferRankScore(offer);
  if (rank.penalties.length) reasons.push(...rank.penalties);
  return [...new Set(reasons)];
}

export async function traceSearchPipeline(
  intent: ShoppingIntent,
  options: {
    afterEnrich?: ProductSearchResults;
    item?: CatalogItem;
    verifiedResolution?: VerifiedInventoryResolution;
  } = {},
): Promise<SearchPipelineTrace> {
  const q = normalizeSearchQuery(intent.query.trim());
  const parsedIntent = extractIntentFromMessage(q, intent.zipCode);
  const attrs = parseQueryAttributes(q);
  const stages: SearchPipelineStage[] = [];

  const verifiedResolution = options.verifiedResolution;
  if (verifiedResolution) {
    stages.push({
      stage: "0_verified_inventory_resolver",
      count: verifiedResolution.candidates.length,
      detail: verifiedResolution.hit ?
        `HIT ${verifiedResolution.catalogItem?.id} via ${verifiedResolution.matchMethod} (score=${verifiedResolution.matchScore}) · ${verifiedResolution.quotes.length} quote(s)`
      : `MISS — ${verifiedResolution.candidates.length} candidate(s)`,
      samples: verifiedResolution.candidates.slice(0, 5).map(
        (c) => `${c.catalogId}:${c.score}${c.hasPersistedQuotes ? "✓" : "✗"}${c.rejectedReason ? ` (${c.rejectedReason})` : ""}`,
      ),
    });
  }

  stages.push({
    stage: "1_query_parse",
    count: 1,
    detail: JSON.stringify({
      normalized: q,
      category: parsedIntent.category ?? intent.category,
      gender: parsedIntent.gender ?? intent.gender,
      productSubtype: parsedIntent.productSubtype,
      productTypes: attrs.productTypes,
      colors: attrs.colors,
    }),
  });

  const suggestions = suggestCatalogProducts(q, 8);
  stages.push({
    stage: "2_keyword_catalog_suggest",
    count: suggestions.length,
    samples: suggestions.slice(0, 5).map((s) => `${s.catalogId} (${s.score})`),
  });

  stages.push({
    stage: "3_synonym_expansion",
    count: attrs.productTypes.length,
    detail: attrs.productTypes.join(", ") || "none",
    samples: [],
  });

  stages.push({
    stage: "4_vector_retrieval",
    count: 0,
    detail: "not_configured — lexical catalog scoring only (SEMANTIC_EMBEDDINGS stub)",
  });

  let { item, resolved } = options.item && verifiedResolution?.hit && verifiedResolution.resolved ?
    { item: options.item, resolved: verifiedResolution.resolved }
  : resolvePrimaryProduct(intent);
  let keywordFallbackUsed = false;

  if (!verifiedResolution?.hit && resolved.synthetic && suggestions[0]) {
    const fallback = CATALOG.find((c) => c.id === suggestions[0]!.catalogId);
    if (fallback) {
      item = fallback;
      resolved = {
        catalogId: fallback.id,
        title: fallback.title,
        brand: fallback.brand,
        confidence: suggestions[0]!.score / 100,
        matchReason: "keyword_fallback_suggest",
        synthetic: false,
      };
      keywordFallbackUsed = true;
    }
  }

  const catalogScores = CATALOG.map((c) => ({
    id: c.id,
    score: scoreItem(c, { ...intent, query: q }),
  }))
    .filter((x) => x.score >= 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  stages.push({
    stage: "5_catalog_resolution",
    count: catalogScores.length,
    detail: `${resolved.catalogId} · ${resolved.matchReason}${keywordFallbackUsed ? " (fallback)" : ""}`,
    samples: catalogScores.map((s) => `${s.id}:${s.score}`),
  });

  const catalogResults = searchCatalog({ ...intent, query: q });
  stages.push({
    stage: "6_catalog_offers_built",
    count: catalogResults.online.length,
    detail: `estimates from ${catalogResults.online.length} retailers`,
  });

  const cached = verifiedResolution?.quotes?.length ?
    verifiedResolution.quotes
  : await loadPersistedLiveQuotes(item.id);
  const live = await fetchLiveQuotes(intent, item, { allowLiveRetailerApis: true });
  stages.push({
    stage: "7_db_cached_quotes",
    count: cached.length,
    samples: cached.slice(0, 5).map((c) => `${c.retailerId}:$${c.price}`),
  });
  stages.push({
    stage: "8_live_api_quotes",
    count: live.quotes.length,
    detail: live.origin ?? "none",
    samples: live.quotes.slice(0, 5).map((c) => `${c.retailerId}:$${c.price}`),
  });

  const compareGrid = compareProduct(item, intent);
  stages.push({
    stage: "9_retailer_adapter_grid",
    count: compareGrid.online.length,
    samples: compareGrid.online.slice(0, 5).map((o) => o.retailer),
  });

  const working = options.afterEnrich ?? compareGrid;
  const allOffers = [...working.online, ...working.local, ...(working.estimatedOnline ?? [])];

  stages.push({
    stage: "10_post_enrichment_offers",
    count: allOffers.length,
    detail: `scraped=${allOffers.filter((o) => o.priceSource === "scraped").length} api=${allOffers.filter((o) => o.priceSource === "connector_api").length} est=${allOffers.filter((o) => o.priceSource === "catalog_model").length}`,
  });

  const verified = allOffers.filter(isVerifiedOffer);
  const displayable = allOffers.filter(isDisplayableOffer);
  stages.push({
    stage: "11_verified_offers",
    count: verified.length,
  });
  stages.push({
    stage: "12_consumer_displayable",
    count: displayable.length,
  });

  const filterReasons: OfferFilterReason[] = allOffers
    .filter((o) => !isDisplayableOffer(o) || !isVerifiedOffer(o))
    .slice(0, 24)
    .map((o) => ({
      offerId: o.id,
      retailer: o.retailer,
      price: o.price,
      priceSource: o.priceSource,
      matchConfidence: o.matchConfidence,
      reasons: whyNotDisplayable(o),
    }));

  const retailerIds = [...new Set(allOffers.map((o) => o.retailer))];
  const trustScores = await getRetailerTrustScores(retailerIds);

  return {
    query: intent.query,
    resolvedCatalogId: resolved.catalogId,
    resolvedTitle: resolved.title,
    matchReason: resolved.matchReason,
    synthetic: resolved.synthetic,
    stages,
    filterReasons,
    retailerHealth: retailerIds.map((id) => ({
      retailerId: id,
      trustScore: trustScores.get(id) ?? 0.5,
    })),
    keywordFallbackUsed,
    semanticNote: "Vector retrieval disabled; verified inventory resolver + catalog keyword scoring",
    verifiedInventoryResolution: verifiedResolution ? {
      matched: verifiedResolution.hit,
      catalogId: verifiedResolution.catalogItem?.id,
      matchMethod: verifiedResolution.matchMethod,
      matchScore: verifiedResolution.matchScore,
      lastVerifiedAt: verifiedResolution.lastVerifiedAt,
      confidence: verifiedResolution.resolved?.confidence,
      normalizationStatus: verifiedResolution.normalizationNote,
      qaStatus: verifiedResolution.qaStatus,
      candidateCount: verifiedResolution.candidates.length,
      candidates: verifiedResolution.candidates.map((c) => ({
        catalogId: c.catalogId,
        title: c.title,
        score: c.score,
        hasPersistedQuotes: c.hasPersistedQuotes,
        rejectedReason: c.rejectedReason,
      })),
    } : undefined,
  };
}

export function searchPipelineDebugEnabled(): boolean {
  if (typeof process !== "undefined") {
    const raw = process.env.SEARCH_PIPELINE_DEBUG?.trim().toLowerCase();
    if (raw === "1" || raw === "true" || raw === "on") return true;
  }
  if (typeof process !== "undefined") {
    const pub = process.env.NEXT_PUBLIC_SEARCH_DEBUG?.trim().toLowerCase();
    if (pub === "1" || pub === "true" || pub === "on") return true;
  }
  return false;
}

export function formatSearchPipelineTrace(trace: SearchPipelineTrace): string {
  const lines = [
    `# Search pipeline: "${trace.query}"`,
    "",
    `Resolved: **${trace.resolvedCatalogId}** — ${trace.resolvedTitle} (${trace.matchReason})`,
    "",
    "| Stage | Count | Detail |",
    "|-------|------:|--------|",
  ];
  for (const s of trace.stages) {
    lines.push(`| ${s.stage} | ${s.count} | ${s.detail ?? s.samples?.slice(0, 3).join(", ") ?? ""} |`);
  }
  if (trace.filterReasons.length) {
    lines.push("", "## Filtered offers", "");
    for (const f of trace.filterReasons.slice(0, 12)) {
      lines.push(
        `- ${f.retailer} $${f.price.toFixed(2)} (${f.priceSource}, conf=${f.matchConfidence?.toFixed(2) ?? "?"}) → ${f.reasons.join(", ")}`,
      );
    }
  }
  return lines.join("\n");
}
