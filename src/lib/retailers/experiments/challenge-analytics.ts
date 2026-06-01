/**
 * Structured challenge analytics from rendered experiment runs.
 */
import type { RenderedFetchResult } from "../../offers/retailer-adapters/rendered-fetch";
import type { ChallengeAnalytics } from "./types";
import { parseHarSummary } from "./har-analytics";

const INTERSTITIAL_RE = /blocked|challenge|captcha|interstitial|px/i;

export function buildChallengeAnalytics(
  result: RenderedFetchResult,
  harContent?: string,
): ChallengeAnalytics {
  const cls = result.classification;
  const lc = result.lifecycle;
  const har = harContent ? parseHarSummary(harContent) : undefined;

  const challenged =
    !cls.ok ||
    cls.category === "captcha" ||
    cls.category === "js_challenge" ||
    cls.category === "interstitial";

  const domBytes = lc?.domBytesAtExtraction ?? cls.bytes ?? 0;
  const minBytes = 1500;
  const domCompleteness = Math.min(1, domBytes / Math.max(minBytes, 1));

  const redirectChain = result.redirectChain ?? [];
  const blockedToInterstitial = redirectChain.some(
    (r) => r.status >= 300 && INTERSTITIAL_RE.test(r.url),
  );

  const telemetryFailures: string[] = [];
  if (result.identity && !result.identity.ok) {
    telemetryFailures.push(`identity:${result.identity.error ?? "failed"}`);
  }
  if (result.coherence && result.coherence.score < 1) {
    telemetryFailures.push(...result.coherence.mismatches.map((m) => `coherence:${m}`));
  }
  if (result.failureKind && result.failureKind !== "ok" && result.failureKind !== "walmart_challenge") {
    telemetryFailures.push(`failure:${result.failureKind}`);
  }
  for (const stage of lc?.stages ?? []) {
    if (/timeout|failed|tunnel/i.test(stage.stage + (stage.note ?? ""))) {
      telemetryFailures.push(`lifecycle:${stage.stage}`);
    }
  }

  return {
    challenged,
    challengeType: cls.category,
    vendor: cls.vendor,
    reason: cls.reason,
    confidence: cls.confidence,
    redirectChain,
    blockedToInterstitial,
    domBytes,
    domCompleteness,
    extractionSuccess: cls.ok && domBytes >= minBytes,
    lifecycleTimedOut: lc?.timedOut ?? false,
    telemetryFailures,
    blockedEndpoints: har?.blockedUrls ?? [],
    pxNetworkCalls: har?.pxUrls ?? [],
    failedRequests: har?.failedRequests ?? [],
  };
}

/** Aggregate challenge frequency over a batch. */
export function challengeFrequencyOverBatch(results: Array<{ analytics: ChallengeAnalytics }>): number {
  if (!results.length) return 0;
  const n = results.filter((r) => r.analytics.challenged).length;
  return Math.round((n / results.length) * 1000) / 1000;
}
