/**
 * Cost-aware transport selection for browser-rendered acquisition.
 * Residential is always last resort — never the default path.
 */
import type { ProxyTransport } from "../../net/proxy-routing";
import type { RetailerId } from "../../types";

export type TransportClass = "direct" | "datacenter" | "residential";

/** Escalation order: cheapest/lightest first. */
export const TRANSPORT_LADDER: TransportClass[] = ["direct", "datacenter", "residential"];

export interface RetailerTransportPolicy {
  retailerId: RetailerId;
  /** Preferred transport when browser rendering is required. */
  preferredTransport: TransportClass;
  /** Only escalate to residential when cheaper paths fail or challenge rate exceeds threshold. */
  residentialRequired: boolean;
  /** Challenge rate 0..1 above which residential may be attempted (if enabled). */
  challengeEscalationThreshold: number;
  /** Max transport escalations per request. */
  retryBudget: number;
  /** Max relative cost score (0..1) for this retailer session. */
  costCeiling: number;
  /** Minimum extraction confidence to accept without escalation. */
  confidenceThreshold: number;
  /** Expected quote freshness (ms). */
  freshnessExpectationMs: number;
  /** Production tier: core | standard | experimental */
  tier: "core" | "standard" | "experimental";
}

const POLICIES: Partial<Record<RetailerId, RetailerTransportPolicy>> = {
  amazon: {
    retailerId: "amazon",
    preferredTransport: "direct",
    residentialRequired: false,
    challengeEscalationThreshold: 0.85,
    retryBudget: 2,
    costCeiling: 0.35,
    confidenceThreshold: 0.75,
    freshnessExpectationMs: 3_600_000,
    tier: "core",
  },
  target: {
    retailerId: "target",
    preferredTransport: "datacenter",
    residentialRequired: false,
    challengeEscalationThreshold: 0.7,
    retryBudget: 3,
    costCeiling: 0.55,
    confidenceThreshold: 0.65,
    freshnessExpectationMs: 7_200_000,
    tier: "standard",
  },
  walmart: {
    retailerId: "walmart",
    preferredTransport: "datacenter",
    residentialRequired: false,
    challengeEscalationThreshold: 0.95,
    retryBudget: 2,
    costCeiling: 0.75,
    confidenceThreshold: 0.5,
    freshnessExpectationMs: 14_400_000,
    tier: "experimental",
  },
  kroger: {
    retailerId: "kroger",
    preferredTransport: "datacenter",
    residentialRequired: true,
    challengeEscalationThreshold: 0.6,
    retryBudget: 2,
    costCeiling: 0.9,
    confidenceThreshold: 0.45,
    freshnessExpectationMs: 86_400_000,
    tier: "experimental",
  },
  costco: {
    retailerId: "costco",
    preferredTransport: "datacenter",
    residentialRequired: true,
    challengeEscalationThreshold: 0.5,
    retryBudget: 1,
    costCeiling: 0.95,
    confidenceThreshold: 0.4,
    freshnessExpectationMs: 86_400_000,
    tier: "experimental",
  },
};

export function getTransportPolicy(retailerId: RetailerId): RetailerTransportPolicy {
  return (
    POLICIES[retailerId] ?? {
      retailerId,
      preferredTransport: "direct",
      residentialRequired: false,
      challengeEscalationThreshold: 0.75,
      retryBudget: 2,
      costCeiling: 0.5,
      confidenceThreshold: 0.6,
      freshnessExpectationMs: 7_200_000,
      tier: "standard",
    }
  );
}

/** Map transport class to ProxyTransport for rendered executor. */
export function transportClassToProxy(t: TransportClass): ProxyTransport {
  return t;
}

/** Build transport attempt order respecting policy — residential only at end. */
export function buildTransportLadder(
  policy: RetailerTransportPolicy,
  options?: { forceResidential?: boolean; observedChallengeRate?: number },
): TransportClass[] {
  const ladder: TransportClass[] = ["direct", "datacenter"];
  const challengeHigh =
    (options?.observedChallengeRate ?? 0) >= policy.challengeEscalationThreshold;
  const allowResidential =
    options?.forceResidential ||
    policy.residentialRequired ||
    (challengeHigh && policy.tier !== "core");

  if (allowResidential) ladder.push("residential");

  // Start from preferred transport (skip cheaper tiers if preferred is higher).
  const prefIdx = ladder.indexOf(policy.preferredTransport);
  if (prefIdx > 0) return ladder.slice(prefIdx);
  return ladder;
}

/** Relative cost per transport class for metrics. */
export const TRANSPORT_COST: Record<TransportClass, number> = {
  direct: 0.05,
  datacenter: 0.25,
  residential: 0.95,
};

export function listTransportPolicies(): RetailerTransportPolicy[] {
  return Object.values(POLICIES).filter(Boolean) as RetailerTransportPolicy[];
}
