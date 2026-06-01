/**
 * Product listing normalization + match analysis.
 * Trust-preserving: variety packs and pack-size mismatches are heavily penalized.
 */

import { titleSimilarity } from "../catalog/title-similarity";
import { extractPackCount } from "./amazon-normalization";
import type { CatalogItem } from "../retailers/catalog";
import type { ProductOffer, ShoppingIntent } from "../types";

export type MatchBand =
  | "exact_verified"
  | "likely_match"
  | "similar"
  | "brand_alternative"
  | "weak"
  | "rejected";

export interface ParsedProductListing {
  packCount: number;
  volumeOz: number | null;
  volumeLb: number | null;
  flavor: string | null;
  isVarietyPack: boolean;
  isMultipack: boolean;
  isSingleServe: boolean;
  isBundle: boolean;
  sizeFamily: "standard" | "family" | "travel" | "bulk" | "unknown";
  brandToken: string | null;
}

export interface ProductMatchFactor {
  code: string;
  message: string;
  matched: boolean;
}

export interface ProductMatchAnalysis {
  band: MatchBand;
  confidence: number;
  shouldReject: boolean;
  reasons: Array<{ code: string; message: string; weight: number }>;
  factors: ProductMatchFactor[];
  displayLabel: string;
  packSizeLabel?: string;
  parsedListing: ParsedProductListing;
  parsedExpected: ParsedProductListing;
}

const VARIETY_PACK =
  /\b(variety\s*pack|assorted|assortment|multi-?pack|sampler|4\s*flavor|four\s*flavor|flavor\s*variety|mixed\s*flavor|combo\s*pack)\b/i;

const MULTIPACK =
  /\b(\d{1,2})\s*[- ]?\s*(pack|pk|count|ct)\b|\bpack\s+of\s+(\d{1,2})\b|\((\d{1,2})\s*(?:count|ct|pk|pack)\)/i;

const SINGLE_SERVE = /\b(single\s*serve|snack\s*size|mini\s*bags?|lunch\s*size|1\s*oz\s*bags?)\b/i;

const BUNDLE =
  /\b(bundle|value\s*pack|club\s*pack|bulk|wholesale|case\s+of)\b/i;

const SIZE_FAMILY = {
  family: /\b(family\s*size|party\s*size|jumbo|mega|large\s*size)\b/i,
  travel: /\b(travel\s*size|on-?the-?go|mini\s*can|small\s*bag)\b/i,
  bulk: /\b(bulk|institutional|food\s*service|restaurant)\b/i,
};

const FLAVOR_WORDS = [
  "classic",
  "original",
  "plain",
  "salted",
  "unsalted",
  "butter",
  "sour cream",
  "cheddar",
  "bbq",
  "barbecue",
  "ranch",
  "nacho",
  "honey nut",
  "whole",
  "2%",
  "skim",
  "vanilla",
  "chocolate",
  "strawberry",
];

const QUERY_SYNONYMS: Record<string, string[]> = {
  chips: ["chips", "crisps", "potato chips"],
  soda: ["soda", "pop", "soft drink", "cola"],
  milk: ["milk", "dairy milk"],
  towel: ["towel", "towels", "paper towel", "paper towels"],
};

function normalizeBrandToken(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .trim()
    .split(/\s+/)[0] ?? "";
}

function parseVolumeOz(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz\b/i);
  if (!m?.[1]) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseVolumeLb(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound)\b/i);
  if (!m?.[1]) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function inferFlavor(text: string): string | null {
  const lower = text.toLowerCase();
  for (const f of FLAVOR_WORDS) {
    if (new RegExp(`\\b${f.replace(/\s+/g, "\\s+")}\\b`, "i").test(lower)) return f;
  }
  return null;
}

function inferSizeFamily(text: string): ParsedProductListing["sizeFamily"] {
  if (SIZE_FAMILY.bulk.test(text)) return "bulk";
  if (SIZE_FAMILY.family.test(text)) return "family";
  if (SIZE_FAMILY.travel.test(text)) return "travel";
  return "unknown";
}

export function expandQuerySynonyms(query: string): string {
  let out = query.toLowerCase();
  for (const variants of Object.values(QUERY_SYNONYMS)) {
    const hit = variants.some((v) => out.includes(v));
    if (hit) {
      for (const v of variants) {
        if (!out.includes(v)) out += ` ${v}`;
      }
    }
  }
  return out;
}

export function parseProductListing(
  title: string,
  catalogSize?: string,
): ParsedProductListing {
  const lower = title.toLowerCase();
  const packFromTitle = extractPackCount(title, catalogSize);
  const multipackMatch = lower.match(MULTIPACK);
  let packCount = packFromTitle;
  if (multipackMatch) {
    const n = parseInt(
      multipackMatch[1] ?? multipackMatch[2] ?? multipackMatch[3] ?? multipackMatch[4] ?? "1",
      10,
    );
    if (n >= 2) packCount = Math.max(packCount, n);
  }

  return {
    packCount,
    volumeOz: parseVolumeOz(title) ?? parseVolumeOz(catalogSize ?? ""),
    volumeLb: parseVolumeLb(title) ?? parseVolumeLb(catalogSize ?? ""),
    flavor: inferFlavor(title),
    isVarietyPack: VARIETY_PACK.test(title),
    isMultipack: packCount >= 2 || MULTIPACK.test(title),
    isSingleServe: SINGLE_SERVE.test(title),
    isBundle: BUNDLE.test(title),
    sizeFamily: inferSizeFamily(title),
    brandToken: normalizeBrandToken(title) || null,
  };
}

function expectedListingFromContext(
  item: CatalogItem,
  intent?: ShoppingIntent,
): ParsedProductListing {
  const query = expandQuerySynonyms(
    [intent?.query, item.brand, item.title].filter(Boolean).join(" "),
  );
  const fromCatalog = parseProductListing(`${item.brand} ${item.title}`, item.size);
  const fromQuery = parseProductListing(query, item.size);

  return {
    ...fromCatalog,
    flavor: fromQuery.flavor ?? fromCatalog.flavor,
    packCount: fromQuery.isMultipack ? fromQuery.packCount : 1,
    isVarietyPack: fromQuery.isVarietyPack,
    isMultipack: fromQuery.isMultipack && fromQuery.packCount > 1,
    isSingleServe: fromQuery.isSingleServe,
    isBundle: fromQuery.isBundle,
    sizeFamily: fromQuery.sizeFamily !== "unknown" ? fromQuery.sizeFamily : fromCatalog.sizeFamily,
    brandToken: normalizeBrandToken(item.brand) || fromQuery.brandToken,
  };
}

function packSizeLabel(parsed: ParsedProductListing): string | undefined {
  const parts: string[] = [];
  if (parsed.packCount > 1) parts.push(`${parsed.packCount}-pack`);
  if (parsed.volumeOz) parts.push(`${parsed.volumeOz} oz`);
  else if (parsed.volumeLb) parts.push(`${parsed.volumeLb} lb`);
  if (parsed.isVarietyPack) parts.push("variety");
  if (parsed.isSingleServe) parts.push("single-serve");
  return parts.length ? parts.join(" · ") : undefined;
}

function bandLabel(band: MatchBand): string {
  switch (band) {
    case "exact_verified":
      return "Exact verified match";
    case "likely_match":
      return "Likely match";
    case "similar":
      return "Closest available match";
    case "brand_alternative":
      return "Same brand · different product";
    case "weak":
      return "Weak match · verify before buying";
    case "rejected":
      return "Match rejected";
  }
}

export function analyzeProductMatch(
  storeTitle: string,
  item: CatalogItem,
  intent?: ShoppingIntent,
  baselineConfidence = 0.72,
): ProductMatchAnalysis {
  const parsedListing = parseProductListing(storeTitle, item.size);
  const parsedExpected = expectedListingFromContext(item, intent);
  const reasons: ProductMatchAnalysis["reasons"] = [];
  const factors: ProductMatchFactor[] = [];

  let confidence = baselineConfidence;
  let shouldReject = false;

  const catalogBlob = `${item.brand} ${item.title}`.toLowerCase();
  const titleSim = titleSimilarity(catalogBlob, storeTitle);
  factors.push({
    code: "title_similarity",
    message: `Title similarity ${(titleSim * 100).toFixed(0)}%`,
    matched: titleSim >= 0.55,
  });

  const brandMatch =
    parsedExpected.brandToken != null &&
    storeTitle.toLowerCase().replace(/['']/g, "").includes(parsedExpected.brandToken);
  factors.push({
    code: "brand",
    message: brandMatch ? "Same brand" : "Brand differs or unclear",
    matched: brandMatch,
  });

  const flavorMatch =
    !parsedExpected.flavor ||
    !parsedListing.flavor ||
    parsedExpected.flavor === parsedListing.flavor;
  factors.push({
    code: "flavor",
    message:
      parsedExpected.flavor && parsedListing.flavor
        ? flavorMatch
          ? `Same flavor (${parsedListing.flavor})`
          : `Flavor mismatch (${parsedExpected.flavor} vs ${parsedListing.flavor})`
        : "Flavor not specified",
    matched: flavorMatch,
  });

  const packMatch =
    parsedExpected.packCount <= 1
      ? parsedListing.packCount <= 1
      : Math.abs(parsedListing.packCount - parsedExpected.packCount) <= 1;
  factors.push({
    code: "pack_count",
    message: packMatch
      ? parsedListing.packCount > 1
        ? `${parsedListing.packCount}-pack`
        : "Single item"
      : `Pack mismatch (${parsedExpected.packCount} expected vs ${parsedListing.packCount} found)`,
    matched: packMatch,
  });

  const sizeMatch =
    !parsedExpected.volumeOz ||
    !parsedListing.volumeOz ||
    Math.abs(parsedExpected.volumeOz - parsedListing.volumeOz) <=
      Math.max(1, parsedExpected.volumeOz * 0.15);
  factors.push({
    code: "size",
    message:
      parsedListing.volumeOz
        ? sizeMatch
          ? `${parsedListing.volumeOz} oz`
          : `Size mismatch (${parsedExpected.volumeOz ?? "?"} oz expected)`
        : "Size not parsed from title",
    matched: sizeMatch,
  });

  if (parsedListing.isVarietyPack && !parsedExpected.isVarietyPack) {
    confidence *= 0.35;
    shouldReject = true;
    reasons.push({
      code: "match.variety_pack",
      message: "Variety/assortment pack does not match single-product search",
      weight: -0.55,
    });
  }

  if (parsedListing.isBundle && !parsedExpected.isBundle) {
    confidence *= 0.4;
    shouldReject = true;
    reasons.push({
      code: "match.bundle",
      message: "Bundle/value pack does not match single-item search",
      weight: -0.5,
    });
  }

  if (!packMatch && parsedListing.packCount >= 4) {
    const ratio = parsedListing.packCount / Math.max(1, parsedExpected.packCount);
    confidence *= ratio >= 8 ? 0.2 : 0.45;
    if (ratio >= 4) shouldReject = true;
    reasons.push({
      code: "match.pack_count",
      message: `Pack count mismatch (${parsedListing.packCount} vs ${parsedExpected.packCount} expected)`,
      weight: -0.45,
    });
  }

  if (!flavorMatch && parsedExpected.flavor && parsedListing.flavor) {
    confidence *= 0.55;
    reasons.push({
      code: "match.flavor",
      message: `Flavor mismatch (${parsedExpected.flavor} vs ${parsedListing.flavor})`,
      weight: -0.35,
    });
  }

  if (!sizeMatch && parsedExpected.volumeOz && parsedListing.volumeOz) {
    confidence *= 0.65;
    reasons.push({
      code: "match.volume",
      message: `Volume mismatch (${parsedExpected.volumeOz}oz vs ${parsedListing.volumeOz}oz)`,
      weight: -0.25,
    });
  }

  if (parsedListing.sizeFamily === "bulk" && parsedExpected.sizeFamily !== "bulk") {
    confidence *= 0.3;
    shouldReject = true;
    reasons.push({
      code: "match.bulk_size",
      message: "Bulk/commercial size does not match consumer search",
      weight: -0.5,
    });
  }

  if (titleSim < 0.38 && !brandMatch) {
    confidence *= 0.5;
    reasons.push({
      code: "match.title_weak",
      message: "Weak title overlap with expected product",
      weight: -0.3,
    });
  } else if (titleSim >= 0.72) {
    confidence = Math.min(0.98, confidence + titleSim * 0.08);
    reasons.push({
      code: "match.title_strong",
      message: "Strong title overlap",
      weight: 0.1,
    });
  }

  confidence = Math.max(0.05, Math.min(0.98, confidence));

  let band: MatchBand;
  if (shouldReject || confidence < 0.42) {
    band = shouldReject ? "rejected" : "weak";
  } else if (confidence >= 0.88 && packMatch && flavorMatch && !parsedListing.isVarietyPack) {
    band = "exact_verified";
  } else if (confidence >= 0.72 && packMatch && flavorMatch) {
    band = "likely_match";
  } else if (brandMatch && (titleSim >= 0.45 || packMatch)) {
    band = parsedListing.isVarietyPack || !packMatch ? "brand_alternative" : "similar";
  } else if (confidence >= 0.55) {
    band = "similar";
  } else {
    band = "weak";
  }

  if (parsedListing.isVarietyPack && !parsedExpected.isVarietyPack) {
    band = "rejected";
    confidence = Math.min(confidence, 0.35);
  }

  if (parsedListing.packCount >= 12 && parsedExpected.packCount <= 1) {
    band = "rejected";
    confidence = Math.min(confidence, 0.32);
    shouldReject = true;
  }

  return {
    band,
    confidence,
    shouldReject,
    reasons,
    factors,
    displayLabel: bandLabel(band),
    packSizeLabel: packSizeLabel(parsedListing),
    parsedListing,
    parsedExpected,
  };
}

export function applyProductMatchToOffer(
  offer: ProductOffer,
  item: CatalogItem,
  intent?: ShoppingIntent,
): ProductOffer {
  const storeTitle = offer.storeTitle ?? offer.title;
  if (!storeTitle?.trim()) return offer;

  const analysis = analyzeProductMatch(
    storeTitle,
    item,
    intent,
    offer.matchConfidence ?? 0.72,
  );

  const reasons = [...(offer.confidenceReasons ?? [])];
  for (const r of analysis.reasons) {
    if (!reasons.some((x) => x.code === r.code)) reasons.push(r);
  }
  for (const f of analysis.factors.filter((x) => x.matched)) {
    const code = `factor.${f.code}`;
    if (!reasons.some((x) => x.code === code)) {
      reasons.push({ code, message: f.message, weight: 0.05 });
    }
  }

  const next: ProductOffer = {
    ...offer,
    matchConfidence: analysis.confidence,
    matchBand: analysis.band,
    matchDisplayLabel: analysis.displayLabel,
    packSizeLabel: analysis.packSizeLabel ?? offer.packSizeLabel,
    confidenceReasons: reasons,
  };

  if (analysis.shouldReject || analysis.band === "rejected") {
    next.pipelineDebug = {
      ...next.pipelineDebug,
      validationStatus: "rejected",
      rejectedReason: analysis.reasons[0]?.code ?? "product_match_rejected",
      priceBadge: next.pipelineDebug?.priceBadge ?? "verified_live",
      source: next.priceSource ?? "scraped",
      imageFallbackLevel: next.pipelineDebug?.imageFallbackLevel ?? 5,
    };
    next.matchConfidence = Math.min(next.matchConfidence ?? 0.5, 0.35);
  }

  return next;
}

export function isExactMatchBand(band?: MatchBand): boolean {
  return band === "exact_verified" || band === "likely_match";
}

export function isAuthoritativeMatchBand(band?: MatchBand): boolean {
  return band === "exact_verified";
}
