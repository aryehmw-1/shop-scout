import type { RetailerId } from "../types";
import type { ProxyTransport } from "../net/proxy-routing";
import { availableTransports } from "../net/proxy-routing";
import { getTransportPolicy } from "./fetch-strategy";
import type { SessionBehaviorId } from "./session-behavior";

/**
 * Escalation ladder generator. Key insight from the Walmart audits: when the
 * browser-realism suspicion score is already ~0, behavioral tuning is wasted
 * effort — the dominant signal is transport/IP reputation. So escalate
 * TRANSPORT first, and only climb behavior once we're on the strongest
 * transport. Example ladder for Walmart:
 *   direct+cold -> datacenter+cold -> residential+cold
 *     -> residential+humanized -> residential+stealth_max
 */
export interface EscalationStep {
  transport: ProxyTransport;
  behavior: SessionBehaviorId;
}

export interface EscalationInput {
  retailerId: RetailerId;
  /** Latest bot-suspicion score (0..1). Low → prioritize transport. */
  suspicion?: number;
  /** Restrict to currently-configured transports (default true). */
  onlyConfigured?: boolean;
}

const BEHAVIOR_LADDER: SessionBehaviorId[] = ["cold", "humanized", "stealth_max"];

export function buildEscalationLadder(input: EscalationInput): EscalationStep[] {
  const suspicion = input.suspicion ?? 0;
  const configured = new Set(availableTransports());
  const policy = getTransportPolicy(input.retailerId).filter(
    (t) => input.onlyConfigured === false || configured.has(t),
  );
  const transports = policy.length ? policy : (["direct"] as ProxyTransport[]);

  const steps: EscalationStep[] = [];

  if (suspicion < 0.4) {
    // Transport-first: try cheapest behavior across all transports before
    // spending on behavioral realism.
    for (const transport of transports) {
      steps.push({ transport, behavior: "cold" });
    }
    // Then climb behavior only on the strongest (last) transport.
    const strongest = transports[transports.length - 1]!;
    for (const behavior of BEHAVIOR_LADDER.slice(1)) {
      steps.push({ transport: strongest, behavior });
    }
  } else {
    // High suspicion → fingerprint matters; climb behavior per transport.
    for (const transport of transports) {
      for (const behavior of BEHAVIOR_LADDER) {
        steps.push({ transport, behavior });
      }
    }
  }

  // De-dup while preserving order.
  const seen = new Set<string>();
  return steps.filter((s) => {
    const k = `${s.transport}:${s.behavior}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
