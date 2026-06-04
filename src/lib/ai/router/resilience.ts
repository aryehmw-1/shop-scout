import type { AIProvider, AIProviderId, AIMessage, GenerateOptions, GenerateResult } from "../providers/types";
import { intelligenceOpsConfig } from "@/lib/commerce-intelligence/ops/config";

interface BreakerState {
  failures: number;
  openedAt: number | null;
}

const breakers = new Map<AIProviderId, BreakerState>();

function getState(id: AIProviderId): BreakerState {
  return breakers.get(id) ?? { failures: 0, openedAt: null };
}

function isOpen(id: AIProviderId): boolean {
  const s = getState(id);
  if (!s.openedAt) return false;
  if (Date.now() - s.openedAt >= intelligenceOpsConfig.circuitCooldownMs) {
    breakers.set(id, { failures: 0, openedAt: null });
    return false;
  }
  return true;
}

function recordSuccess(id: AIProviderId): void {
  breakers.set(id, { failures: 0, openedAt: null });
}

function recordFailure(id: AIProviderId): void {
  const s = getState(id);
  const failures = s.failures + 1;
  if (failures >= intelligenceOpsConfig.circuitFailureThreshold) {
    breakers.set(id, { failures, openedAt: Date.now() });
  } else {
    breakers.set(id, { failures, openedAt: null });
  }
}

export function getCircuitBreakerStatus(): Record<
  AIProviderId,
  { open: boolean; failures: number; cooldownMsRemaining: number }
> {
  const out: Record<string, { open: boolean; failures: number; cooldownMsRemaining: number }> = {};
  for (const [id, s] of breakers) {
    const open = isOpen(id);
    const remaining =
      s.openedAt ?
        Math.max(0, intelligenceOpsConfig.circuitCooldownMs - (Date.now() - s.openedAt))
      : 0;
    out[id] = { open, failures: s.failures, cooldownMsRemaining: remaining };
  }
  return out as Record<AIProviderId, { open: boolean; failures: number; cooldownMsRemaining: number }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retry with exponential backoff + per-provider circuit breaker.
 */
export async function generateWithResilience(
  provider: AIProvider,
  messages: AIMessage[],
  options?: GenerateOptions,
): Promise<GenerateResult | null> {
  if (!provider.isAvailable()) return null;
  if (isOpen(provider.id)) {
    if (process.env.AI_ROUTER_DEBUG === "1") {
      console.info("[ai-circuit] open", provider.id);
    }
    return null;
  }

  const max = intelligenceOpsConfig.providerMaxRetries;
  const base = intelligenceOpsConfig.providerRetryBaseMs;
  let lastError: unknown;

  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      const result = await provider.generate(messages, options);
      if (result?.text) {
        recordSuccess(provider.id);
        return result;
      }
      lastError = new Error("empty_response");
    } catch (e) {
      lastError = e;
    }

    if (attempt < max) {
      await sleep(base * 2 ** attempt);
    }
  }

  recordFailure(provider.id);
  if (process.env.AI_ROUTER_DEBUG === "1") {
    console.warn("[ai-resilience] failed", provider.id, lastError);
  }
  return null;
}
