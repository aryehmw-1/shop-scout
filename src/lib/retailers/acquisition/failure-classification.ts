import type { ResponseClassification } from "../../net/response-classification";

/** Operational failure buckets for retailer acquisition diagnostics. */
export type AcquisitionFailureClass =
  | "success"
  | "blocked"
  | "empty_parse"
  | "selector_mismatch"
  | "anti_bot"
  | "timeout"
  | "partial_success"
  | "no_price_extracted";

export interface AcquisitionFailureInput {
  fetchOk: boolean;
  fetchReason?: string;
  parserRan?: boolean;
  parserFoundMatch?: boolean;
  hasPrice?: boolean;
  hasPdp?: boolean;
  hasImage?: boolean;
  classification?: ResponseClassification;
}

const ANTI_BOT_CATEGORIES = new Set([
  "captcha",
  "interstitial",
  "js_challenge",
  "login_wall",
  "rate_limited",
  "access_denied",
]);

export function classifyAcquisitionFailure(
  input: AcquisitionFailureInput,
): AcquisitionFailureClass {
  if (!input.fetchOk) {
    const reason = input.fetchReason ?? "";
    if (/timeout|ETIMEDOUT|AbortError|timed out/i.test(reason)) return "timeout";
    if (
      input.classification &&
      ANTI_BOT_CATEGORIES.has(input.classification.category)
    ) {
      return "anti_bot";
    }
    if (/403|bot-wall|blocked|captcha|access denied|empty-or-blocked/i.test(reason)) {
      return "blocked";
    }
    if (/404|not-found/i.test(reason)) return "empty_parse";
    return "blocked";
  }

  const parserOk = input.parserRan !== false && input.parserFoundMatch !== false;
  if (!parserOk) {
    const reason = input.fetchReason ?? "";
    if (/selector|parser|adapter|no-match|no_parser/i.test(reason)) {
      return "selector_mismatch";
    }
    return "empty_parse";
  }

  const hasPrice = Boolean(input.hasPrice);
  const hasPdp = Boolean(input.hasPdp);
  const hasImage = Boolean(input.hasImage);

  if (!hasPrice && (hasPdp || hasImage)) return "no_price_extracted";
  if (hasPrice && (!hasPdp || !hasImage)) return "partial_success";
  if (!hasPrice) return "empty_parse";
  return "success";
}

export function isPartialEnrichmentSuccess(failureClass: AcquisitionFailureClass): boolean {
  return (
    failureClass === "partial_success" ||
    failureClass === "no_price_extracted"
  );
}
