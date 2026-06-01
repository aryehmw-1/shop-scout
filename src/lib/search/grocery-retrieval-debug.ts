import { CATALOG } from "../retailers/catalog";
import { passesConsumerTrustGates } from "../offers/consumer-trust";
import { isDisplayableOffer } from "../offers/offer-persist-validation";
import type { ProductOffer, ShoppingIntent, GroceryRetrievalDebugSummary } from "../types";
import {
  decomposeGroceryQuery,
  isGroceryQuery,
  resolveGroceryProduct,
} from "./grocery-retrieval";
import { resolvePrimaryProduct } from "./product-resolver";
import { suggestCatalogProducts } from "./query-normalize";

export function groceryRetrievalDebugEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const raw =
    process.env.GROCERY_RETRIEVAL_DEBUG ??
    process.env.SEARCH_PIPELINE_DEBUG ??
    process.env.NEXT_PUBLIC_SEARCH_DEBUG;
  const v = raw?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

function rejectionReasonForOffers(offers: ProductOffer[]): string[] {
  const reasons: string[] = [];
  if (offers.length === 0) {
    reasons.push("no_offers_in_pipeline");
    return reasons;
  }
  const displayable = offers.filter(isDisplayableOffer);
  const verified = displayable.filter(passesConsumerTrustGates);
  if (displayable.length === 0) {
    reasons.push("all_offers_failed_display_validation");
  }
  if (verified.length === 0 && displayable.length > 0) {
    reasons.push("no_offers_passed_consumer_trust_gates");
  }
  const catalogOnly = offers.filter((o) => o.priceSource === "catalog_model");
  if (catalogOnly.length > 0 && verified.length === 0) {
    reasons.push("catalog_estimates_suppressed_by_trust_gates");
  }
  return reasons;
}

/** Build a diagnostic trace when grocery search dead-ends or confidence is low. */
export function buildGroceryRetrievalDebug(
  intent: ShoppingIntent,
  offers: ProductOffer[] = [],
): GroceryRetrievalDebugSummary {
  const decomposed = decomposeGroceryQuery(intent.query, intent);
  const grocery = resolveGroceryProduct(intent);
  const primary = resolvePrimaryProduct(intent);
  const suggestions = suggestCatalogProducts(decomposed.normalized, 8);

  const candidates =
    grocery?.alternatives.length ?
      grocery.alternatives.map((a) => ({
        catalogId: a.item.id,
        title: a.item.title,
        brand: a.item.brand,
        score: a.score,
        tier: a.tier,
      }))
    : suggestions.map((s) => {
        const item = CATALOG.find((c) => c.id === s.catalogId);
        return {
          catalogId: s.catalogId,
          title: item?.title ?? s.title,
          brand: item?.brand ?? s.brand,
          score: s.score,
        };
      });

  const displayable = offers.filter(isDisplayableOffer);
  const verified = displayable.filter(passesConsumerTrustGates);
  const closest = offers.filter((o) => o.dealLabel === "closest_match");

  const rejectionReasons = rejectionReasonForOffers(offers);
  if (!grocery && isGroceryQuery(intent.query, intent)) {
    rejectionReasons.push("grocery_resolver_returned_null");
  }
  if (grocery && grocery.tierRank >= 3) {
    rejectionReasons.push(`low_confidence_tier_${grocery.tier}`);
  }
  if (primary.resolved.synthetic) {
    rejectionReasons.push("primary_resolver_synthetic_fallback");
  }

  return {
    query: intent.query,
    normalizedQuery: decomposed.normalized,
    isGroceryQuery: isGroceryQuery(intent.query, intent),
    parsedBrand: decomposed.brand,
    parsedCategory: decomposed.category,
    productTypes: decomposed.productTypes,
    privateLabel: decomposed.privateLabel,
    tierReached: grocery?.tier ?? (suggestions.length ? "broad_fuzzy" : undefined),
    tierRank: grocery?.tierRank,
    resolvedCatalogId: grocery?.item.id ?? primary.item.id,
    resolvedTitle: grocery?.item.title ?? primary.item.title,
    matchReason: grocery?.resolved.matchReason ?? primary.resolved.matchReason,
    resolverConfidence: grocery?.resolved.confidence ?? primary.resolved.confidence,
    candidateRetrievals: candidates.slice(0, 8),
    fallbackTierExecuted: Boolean(grocery && grocery.tierRank >= 3),
    rejectionReasons,
    displayableOfferCount: displayable.length,
    verifiedOfferCount: verified.length,
    closestMatchOfferCount: closest.length,
  };
}

export function logGroceryRetrievalFailure(
  intent: ShoppingIntent,
  offers: ProductOffer[] = [],
): GroceryRetrievalDebugSummary | undefined {
  if (!groceryRetrievalDebugEnabled()) return undefined;
  const summary = buildGroceryRetrievalDebug(intent, offers);
  const deadEnd = offers.length === 0 || summary.verifiedOfferCount === 0;
  if (!deadEnd && (summary.resolverConfidence ?? 0) >= 0.75) return summary;

  console.warn("[grocery-retrieval]", JSON.stringify(summary, null, 2));
  return summary;
}
