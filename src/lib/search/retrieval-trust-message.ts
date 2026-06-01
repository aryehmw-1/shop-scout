/**
 * Explain WHY search returned no verified offers — avoid generic empty states.
 */

import type { ProductSearchResults } from "../types";
import { getCategoryConfidenceMessage } from "../inventory/category-messaging";
import { inferQueryCategoryFamily } from "../inventory/category-coverage";

export interface RetrievalTrustDiagnostic {
  headline: string;
  detail: string;
  hints: string[];
  severity: "empty" | "partial" | "filtered";
}

export function buildRetrievalTrustDiagnostic(
  results: ProductSearchResults,
  query?: string,
): RetrievalTrustDiagnostic {
  const verified = results.online.length;
  const low = results.lowConfidenceOnline?.length ?? 0;
  const estimated = results.estimatedOnline?.length ?? 0;
  const debug = results.searchDebug;
  const family = inferQueryCategoryFamily(query);
  const categoryMsg = getCategoryConfidenceMessage(query);

  if (verified > 0) {
    return {
      headline: `${verified} verified offer${verified === 1 ? "" : "s"} found`,
      detail: "Live or persisted verified prices passed trust gates.",
      hints: [],
      severity: "partial",
    };
  }

  if (low > 0 || estimated > 0) {
    return {
      headline: "No verified offers passed trust gates",
      detail: `${low || estimated} lower-confidence match${(low || estimated) === 1 ? "" : "es"} found below — retailers may have responded but offers failed verification.`,
      hints: [
        family === "apparel"
          ? "Paste a direct Amazon product URL for apparel — live retailer blocking is common"
          : "Try a more specific product name or paste a direct product link",
        "Browse verified grocery inventory where coverage is production-grade",
      ],
      severity: "filtered",
    };
  }

  const hints: string[] = [...categoryMsg.tips.slice(0, 2)];
  let detail = categoryMsg.detail;
  let headline = categoryMsg.headline;

  if (debug) {
    const cached = debug.stages.find((s) => s.stage === "7_db_cached_quotes")?.count ?? 0;
    const live = debug.stages.find((s) => s.stage === "8_live_api_quotes")?.count ?? 0;
    const postEnrich = debug.stages.find((s) => s.stage === "10_post_enrichment_offers")?.count ?? 0;
    const displayable = debug.stages.find((s) => s.stage === "12_consumer_displayable")?.count ?? 0;

    if (cached > 0 && displayable === 0) {
      detail = `${cached} persisted quote(s) exist but did not pass consumer trust gates for this query. ${detail}`;
      hints.push("Indexed inventory may need manual QA approval");
    } else if (postEnrich > 0 && displayable === 0) {
      detail = `${postEnrich} offer(s) retrieved but all were filtered by confidence, image, or identity checks.`;
      hints.push("Verification thresholds may be too strict for this category");
    } else if (cached === 0 && live === 0 && postEnrich === 0) {
      detail = "Live retailer pricing and cached quotes both unavailable. " + detail;
      if (family === "apparel") {
        hints.push("Some apparel retailers block automated price checks — try a direct Amazon product URL");
      }
    }

    const topReasons = debug.filterReasons
      .flatMap((f) => f.reasons)
      .reduce((acc, r) => {
        acc[r] = (acc[r] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    const dominant = Object.entries(topReasons).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (dominant === "not_verified_offer") {
      hints.push("Offers are catalog estimates — run enrichment or wait for index refresh");
    }
    if (dominant === "consumer_trust_failed" || dominant?.includes("consumer")) {
      hints.push("Consumer trust gates (0.72 match, image, identity) rejected matches");
    }
    if (dominant === "catalog-estimate" || dominant === "non-verified-source") {
      hints.push("Only estimated catalog prices available — try again or paste a product link");
    }
  }

  if (debug?.keywordFallbackUsed) {
    hints.push("Keyword catalog fallback was used — semantic match may be weak");
  }

  return {
    headline,
    detail,
    hints: [...new Set(hints)],
    severity: "empty",
  };
}
