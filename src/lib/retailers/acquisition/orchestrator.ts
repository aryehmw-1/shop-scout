/**
 * Cost-aware acquisition orchestrator.
 * Optimizes: reliability → compliance → cost → scale → simplicity.
 * Residential transport is last resort only.
 */
import type { RetailerId } from "../../types";
import type {
  AcquisitionRequest,
  AcquisitionResult,
  AcquisitionAttemptRecord,
  AcquisitionMethod,
  AcquisitionFailureKind,
} from "./types";
import {
  getRetailerCapability,
  enrichCapabilityWithMetrics,
} from "./capability-registry";
import { fetchRetailerHtmlWithRetries } from "../../offers/retailer-adapters/retailer-fetch";
// import {
//   fetchRenderedHtml,
//   isRenderedFetchEnabled,
// } from "../../offers/retailer-adapters/rendered-fetch";
import { isAmazonPaapiConfigured } from "../../search/providers/amazon-paapi-config";
import {
  buildTransportLadder,
  getTransportPolicy,
  TRANSPORT_COST,
  type TransportClass,
} from "./transport-policy";
import {
  getRetailerMetadata,
  orderMethodsByPriority,
} from "./retailer-metadata-registry";
import { tryCachedStructuredQuote, asAttemptRecord } from "./quote-cache-path";
import { getCachedPath, recordPathOutcome } from "./path-cache";
import { recordOrchestrationEvent } from "./orchestration-metrics";

const RETRYABLE: AcquisitionFailureKind[] = [
  "proxy_failure",
  "navigation_timeout",
  "empty_response",
  "transport_failure",
  "rate_limited",
  "stale_cache",
  "unknown",
];

const TERMINAL: AcquisitionFailureKind[] = [
  "walmart_challenge",
  "not_configured",
  "parse_error",
];

async function executeBrowserRendered(
  req: AcquisitionRequest,
  transport: TransportClass,
  challengeRate?: number,
): Promise<
  AcquisitionAttemptRecord & {
    html?: string;
    status: number;
    classification?: AcquisitionResult["classification"];
  }
> {
  const start = Date.now();
  // if (!isRenderedFetchEnabled()) {
  //   return {
  //     method: "browser_rendered",
  //     ok: false,
  //     failureKind: "not_configured",
  //     latencyMs: Date.now() - start,
  //     reason: "INDEX_ENABLE_RENDERED not set",
  //     status: 0,
  //     transport,
  //     costScore: TRANSPORT_COST[transport],
  //   };
  // }

  const policy = getTransportPolicy(req.retailerId);
  if (transport === "residential" && policy.tier === "experimental") {
    // Experimental retailers: datacenter first; residential only on explicit force or high challenge
    if (!policy.residentialRequired && (challengeRate ?? 0) < policy.challengeEscalationThreshold) {
      return {
        method: "browser_rendered",
        ok: false,
        failureKind: "not_configured",
        latencyMs: Date.now() - start,
        reason: "residential_skipped_experimental_tier",
        status: 0,
        transport,
        costScore: TRANSPORT_COST[transport],
      };
    }
  }

  // const res = await fetchRenderedHtml(req.url, req.retailerId, {
  //   transport,
  //   probeIdentity: transport === "residential",
  // });

  // return {
  //   method: "browser_rendered",
  //   ok: res.ok,
  //   failureKind: res.failureKind as AcquisitionFailureKind,
  //   latencyMs: Date.now() - start,
  //   html: res.html,
  //   status: res.status,
  //   classification: {
  //     category: res.classification.category,
  //     reason: res.classification.reason,
  //     vendor: res.classification.vendor,
  //   },
  //   reason: res.classification.reason,
  //   transport,
  //   costScore: TRANSPORT_COST[transport],
  // };

  return {
    method: "browser_rendered",
    ok: false,
    failureKind: "not_configured",
    latencyMs: Date.now() - start,
    reason: "rendered-fetch temporarily disabled",
    status: 0,
    transport,
    costScore: TRANSPORT_COST[transport],
  };
}

async function executeMethod(
  method: AcquisitionMethod,
  req: AcquisitionRequest,
  ctx: { challengeRate?: number; transport?: TransportClass },
): Promise<
  AcquisitionAttemptRecord & {
    html?: string;
    status: number;
    classification?: AcquisitionResult["classification"];
    fromCache?: boolean;
  }
> {
  const start = Date.now();
  const cap = getRetailerCapability(req.retailerId);
  const methodCfg = cap.methods.find((m) => m.method === method);
  const baseCost = methodCfg?.costScore ?? 0.5;

  try {
    switch (method) {
      case "official_api": {
        if (req.retailerId === "amazon" && isAmazonPaapiConfigured()) {
          return {
            method,
            ok: true,
            latencyMs: Date.now() - start,
            status: 200,
            reason: "amazon_paapi_configured — use search pipeline for quotes",
            transport: "direct",
            costScore: baseCost,
            html: "<!-- official_api amazon paapi -->",
          };
        }
        return {
          method,
          ok: false,
          failureKind: "not_configured",
          latencyMs: Date.now() - start,
          reason: `${method} not configured for ${req.retailerId}`,
          status: 0,
          transport: "direct",
          costScore: baseCost,
        };
      }
      case "affiliate_feed":
      case "merchant_feed":
      case "public_structured":
        return {
          method,
          ok: false,
          failureKind: "not_configured",
          latencyMs: Date.now() - start,
          reason: `${method} feed integration pending`,
          status: 0,
          transport: "direct",
          costScore: baseCost,
        };
      case "cached_structured": {
        const ttl = methodCfg?.freshnessTtlMs ?? 7_200_000;
        const hit = await tryCachedStructuredQuote(req.retailerId, req.url, ttl);
        const attempt = asAttemptRecord(hit, Date.now() - start);
        return {
          ...attempt,
          html: hit.html,
          status: hit.status,
          fromCache: hit.fromCache,
        };
      }
      case "http_lightweight": {
        const res = await fetchRetailerHtmlWithRetries(req.url, req.retailerId);
        if (!res) {
          return {
            method,
            ok: false,
            failureKind: "empty_response",
            latencyMs: Date.now() - start,
            reason: "fetch_returned_null",
            status: 0,
            transport: "direct",
            costScore: baseCost,
          };
        }
        const ok = Boolean(res.html && res.html.length > 500);
        return {
          method,
          ok,
          failureKind: ok ? undefined : "empty_response",
          latencyMs: Date.now() - start,
          html: res.html,
          status: res.status ?? 0,
          reason: ok ? undefined : "empty_or_too_short",
          transport: res.proxyUsed ? "datacenter" : "direct",
          costScore: baseCost,
        };
      }
      case "browser_rendered": {
        const policy = getTransportPolicy(req.retailerId);
        const cached = await getCachedPath(req.retailerId);
        const ladder = buildTransportLadder(policy, {
          observedChallengeRate: ctx.challengeRate,
          forceResidential: cached?.transport === "residential" && policy.residentialRequired,
        });

        let lastAttempt: AcquisitionAttemptRecord & {
          html?: string;
          status: number;
          classification?: AcquisitionResult["classification"];
        } = {
          method: "browser_rendered",
          ok: false,
          failureKind: "transport_failure",
          latencyMs: 0,
          status: 0,
          transport: ladder[0],
          costScore: baseCost,
        };

        for (const transport of ladder.slice(0, policy.retryBudget + 1)) {
          const attempt = await executeBrowserRendered(req, transport, ctx.challengeRate);
          lastAttempt = attempt;
          if (attempt.ok && attempt.html) {
            return { ...attempt, costScore: (methodCfg?.costScore ?? 0.85) + TRANSPORT_COST[transport] };
          }
          if (attempt.failureKind && TERMINAL.includes(attempt.failureKind)) break;
        }
        return lastAttempt;
      }
      default:
        return {
          method,
          ok: false,
          failureKind: "not_configured",
          latencyMs: Date.now() - start,
          status: 0,
          transport: "direct",
          costScore: baseCost,
        };
    }
  } catch (e) {
    return {
      method,
      ok: false,
      failureKind: "transport_failure",
      latencyMs: Date.now() - start,
      reason: String(e).slice(0, 120),
      status: 0,
      transport: ctx.transport ?? "direct",
      costScore: baseCost,
    };
  }
}

function buildMethodOrder(req: AcquisitionRequest) {
  const cap = enrichCapabilityWithMetrics(getRetailerCapability(req.retailerId));
  const meta = getRetailerMetadata(req.retailerId);

  const enabled = cap.methods.filter(
    (m) => m.enabled && m.costScore <= (req.maxCostScore ?? getTransportPolicy(req.retailerId).costCeiling),
  );
  const ordered = orderMethodsByPriority(
    enabled.map((m) => m.method),
    meta.preferredMethods,
  );

  return {
    cap,
    meta,
    orderedMethods: ordered.map((method) => enabled.find((m) => m.method === method)!).filter(Boolean),
  };
}

/**
 * Acquire retailer page content using cost-aware multi-strategy orchestration.
 */
export async function acquireRetailerPage(req: AcquisitionRequest): Promise<AcquisitionResult> {
  const { cap, orderedMethods } = buildMethodOrder(req);
  const policy = getTransportPolicy(req.retailerId);
  const cachedPath = await getCachedPath(req.retailerId);

  // Prefer last successful path when healthy
  const methodsToTry = [...orderedMethods];
  if (cachedPath) {
    const idx = methodsToTry.findIndex((m) => m.method === cachedPath.method);
    if (idx > 0) {
      const [hit] = methodsToTry.splice(idx, 1);
      methodsToTry.unshift(hit);
    }
  }

  const attempts: AcquisitionAttemptRecord[] = [];
  const started = Date.now();
  let escalated = false;

  for (let i = 0; i < methodsToTry.length; i++) {
    const cfg = methodsToTry[i];
    if (i > 0) escalated = true;

    const attempt = await executeMethod(cfg.method, req, {
      challengeRate: cap.challengeRate,
      transport: cachedPath?.transport,
    });

    attempts.push({
      method: attempt.method,
      ok: attempt.ok,
      failureKind: attempt.failureKind,
      latencyMs: attempt.latencyMs,
      reason: attempt.reason,
      transport: attempt.transport,
      costScore: attempt.costScore,
    });

    if (attempt.ok && attempt.html) {
      const domBytes = attempt.html.length;
      const extractionConfidence = Math.min(
        policy.confidenceThreshold + 0.15,
        (domBytes / 1500) * cfg.reliabilityScore * (attempt.fromCache ? 0.9 : 1),
      );
      const costScore = attempt.costScore ?? cfg.costScore;

      await recordPathOutcome({
        retailerId: req.retailerId,
        method: cfg.method,
        transport: attempt.transport as TransportClass | undefined,
        ok: true,
        confidence: extractionConfidence,
      });

      void recordOrchestrationEvent({
        retailerId: req.retailerId,
        method: cfg.method,
        transport: attempt.transport as TransportClass | undefined,
        ok: true,
        latencyMs: Date.now() - started,
        costScore,
        extractionConfidence,
        fromCache: attempt.fromCache,
        escalated,
      });

      return {
        ok: true,
        method: cfg.method,
        retailerId: req.retailerId,
        url: req.url,
        html: attempt.html,
        status: attempt.status,
        classification: attempt.classification,
        latencyMs: Date.now() - started,
        fromCache: attempt.fromCache,
        transport: attempt.transport,
        costScore,
        escalated,
        strategyAttempts: attempts,
        extractionConfidence: Math.round(extractionConfidence * 1000) / 1000,
      };
    }

    if (attempt.failureKind && !RETRYABLE.includes(attempt.failureKind)) {
      break;
    }
  }

  const last = attempts[attempts.length - 1];
  await recordPathOutcome({
    retailerId: req.retailerId,
    method: last?.method ?? cap.defaultMethod,
    transport: last?.transport as TransportClass | undefined,
    ok: false,
    confidence: 0,
  });

  void recordOrchestrationEvent({
    retailerId: req.retailerId,
    method: last?.method ?? cap.defaultMethod,
    transport: last?.transport as TransportClass | undefined,
    ok: false,
    failureKind: last?.failureKind,
    latencyMs: Date.now() - started,
    costScore: last?.costScore ?? 0,
    extractionConfidence: 0,
    escalated,
  });

  return {
    ok: false,
    method: last?.method ?? cap.defaultMethod,
    retailerId: req.retailerId,
    url: req.url,
    status: 0,
    failureKind: last?.failureKind ?? "unknown",
    latencyMs: Date.now() - started,
    escalated,
    strategyAttempts: attempts,
    extractionConfidence: 0,
  };
}

/** Explain acquisition plan for debug UI / logs. */
export function explainAcquisitionPlan(req: AcquisitionRequest) {
  const { cap, meta, orderedMethods } = buildMethodOrder(req);
  const policy = getTransportPolicy(req.retailerId);
  const transportLadder = buildTransportLadder(policy, { observedChallengeRate: cap.challengeRate });

  return {
    retailerId: req.retailerId,
    businessPriority: meta.businessPriority,
    partnershipTier: meta.partnershipTier,
    capability: cap,
    policy,
    transportLadder,
    orderedMethods: orderedMethods.map((m) => ({
      method: m.method,
      costScore: m.costScore,
      reliabilityScore: m.reliabilityScore,
      efficiency: Math.round((m.reliabilityScore / m.costScore) * 100) / 100,
      notes: m.notes,
    })),
    optimizationGoals: ["reliability", "compliance", "cost", "scale", "simplicity"],
  };
}
