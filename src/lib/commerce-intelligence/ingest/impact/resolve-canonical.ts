import { titleSimilarity } from "@/lib/demo-commerce/amazon-enrichment/similarity";
import { normalizeCategory } from "@/lib/demo-commerce/taxonomy";
import { normalizeEnrichmentTitle } from "@/lib/demo-commerce/amazon-enrichment/normalize";
import { canonicalizeBrand } from "@/lib/identity/normalize-brand";
import type { CommerceIntelligenceGraph, EvidenceRecord, RetailerOfferNode } from "../../graph/types";
import { loadGraph, resolveCanonicalIdFromIndex, saveGraph } from "../../graph/store";
import { stableOfferId, provisionalCanonicalId } from "./parse-feed";
import type { NormalizedImpactRow } from "./types";
import { getRetailerMeta } from "@/lib/retailers/meta";
import type { IngestRunReport } from "../events";

const TITLE_MERGE_THRESHOLD = 0.55;

export interface ResolveResult {
  canonical_id: string;
  created: boolean;
  match_method: "gtin" | "asin" | "title" | "new";
}

function identifierKeys(row: NormalizedImpactRow): {
  gtin?: string;
  upc?: string;
  asin?: string;
} {
  return {
    gtin: row.identifiers.gtin,
    upc: row.identifiers.upc,
    asin: row.identifiers.asin,
  };
}

function findByTitle(graphs: CommerceIntelligenceGraph[], row: NormalizedImpactRow): string | null {
  let best: { id: string; score: number } | null = null;
  const needle = normalizeEnrichmentTitle(row.title, row.brand ?? undefined);
  for (const g of graphs) {
    const score = titleSimilarity(needle, g.canonical.title_normalized);
    if (score >= TITLE_MERGE_THRESHOLD && (!best || score > best.score)) {
      best = { id: g.canonical.canonical_id, score };
    }
  }
  return best?.id ?? null;
}

function newGraphFromRow(row: NormalizedImpactRow, canonicalId: string): CommerceIntelligenceGraph {
  const now = new Date().toISOString();
  const titleNorm = normalizeEnrichmentTitle(row.title, row.brand ?? undefined);
  const { category } = normalizeCategory(row.title, row.category_raw ?? undefined, row.retailer);

  return {
    version: 1,
    updated_at: now,
    canonical: {
      canonical_id: canonicalId,
      version: 1,
      title: row.title,
      title_normalized: titleNorm,
      brand: row.brand,
      brand_canonical: row.brand ? (canonicalizeBrand(row.brand) ?? null) : null,
      category,
      canonical_image: row.image_url,
      canonical_image_source: "feed",
      attributes: {},
      identifiers: { ...row.identifiers },
      keywords: titleNorm.split(/\s+/).filter((t) => t.length > 3).slice(0, 12),
      created_at: now,
      updated_at: now,
    },
    identity_confidence: {
      overall: 0.5,
      identifier_agreement: row.identifiers.gtin || row.identifiers.asin ? 0.8 : 0.4,
      title_consensus: 0.5,
      brand_consistency: 0.7,
      attribute_consistency: 0.5,
      multi_source_agreement: 0.35,
      reasons: [{ code: "ingest.new", message: "Created from Impact feed row", weight: 0.2 }],
    },
    offers: [],
    evidence: [],
  };
}

export function resolveCanonicalForRow(
  row: NormalizedImpactRow,
  report: IngestRunReport,
  existingGraphs: CommerceIntelligenceGraph[],
): ResolveResult {
  const ids = identifierKeys(row);
  let canonicalId = resolveCanonicalIdFromIndex(ids);
  let match_method: ResolveResult["match_method"] = "new";

  if (canonicalId) {
    match_method = ids.gtin || ids.upc ? "gtin" : "asin";
    report.match_stats.by_gtin += ids.gtin || ids.upc ? 1 : 0;
    report.match_stats.by_asin += ids.asin && !ids.gtin ? 1 : 0;
  } else {
    const byTitle = findByTitle(existingGraphs, row);
    if (byTitle) {
      canonicalId = byTitle;
      match_method = "title";
      report.match_stats.by_title++;
    } else {
      canonicalId = provisionalCanonicalId(row);
      match_method = "new";
      report.match_stats.new_canonical++;
    }
  }

  let graph = loadGraph(canonicalId);
  const created = !graph;
  if (!graph) {
    graph = newGraphFromRow(row, canonicalId);
    saveGraph(graph);
    report.canonicals_created++;
    report.events.push({
      type: "canonical_created",
      at: new Date().toISOString(),
      source: report.source,
      payload: { canonical_id: canonicalId, title: row.title },
    });
  } else {
    report.canonicals_updated++;
    report.events.push({
      type: "canonical_merged",
      at: new Date().toISOString(),
      source: report.source,
      payload: { canonical_id: canonicalId, match_method },
    });
  }

  return { canonical_id: canonicalId, created, match_method };
}

export function upsertOfferOnGraph(
  graph: CommerceIntelligenceGraph,
  row: NormalizedImpactRow,
  report: IngestRunReport,
): RetailerOfferNode {
  const now = new Date().toISOString();
  const meta = getRetailerMeta(row.retailer);
  const offerId = stableOfferId(graph.canonical.canonical_id, row.retailer, row.product_url);

  const offer: RetailerOfferNode = {
    offer_id: offerId,
    canonical_id: graph.canonical.canonical_id,
    retailer: row.retailer,
    retailer_name: meta.name,
    store_title: row.title,
    product_url: row.product_url,
    affiliate_url: row.affiliate_url,
    price: row.price,
    currency: row.currency,
    was_price: row.was_price,
    availability: row.availability,
    link_type: row.link_type,
    provenance: {
      source_type: "impact_feed",
      source_id: `${row.catalog_id}:${row.advertiser_name}`,
      fetched_at: now,
      source_reliability: 0.88,
      raw_reference: row.row_id,
    },
    validation_status: "pending",
    freshness_tier: "fresh",
    expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  };

  const idx = graph.offers.findIndex((o) => o.offer_id === offerId);
  if (idx >= 0) graph.offers[idx] = { ...graph.offers[idx]!, ...offer };
  else graph.offers.push(offer);

  const evidenceId = `ev-${offerId}`;
  const evidence: EvidenceRecord = {
    evidence_id: evidenceId,
    canonical_id: graph.canonical.canonical_id,
    evidence_type: "feed_row",
    provenance: offer.provenance,
    payload: {
      row_id: row.row_id,
      retailer: row.retailer,
      price: row.price,
      title: row.title,
    },
    weight: 0.85,
    created_at: now,
  };
  const evIdx = graph.evidence.findIndex((e) => e.evidence_id === evidenceId);
  if (evIdx >= 0) graph.evidence[evIdx] = evidence;
  else graph.evidence.push(evidence);

  graph.canonical.identifiers = {
    ...graph.canonical.identifiers,
    ...row.identifiers,
  };
  graph.canonical.updated_at = now;
  graph.updated_at = now;

  report.offers_upserted++;
  report.events.push({
    type: "offer_upserted",
    at: now,
    source: report.source,
    payload: { offer_id: offerId, retailer: row.retailer, price: row.price },
  });

  saveGraph(graph);
  return offer;
}
