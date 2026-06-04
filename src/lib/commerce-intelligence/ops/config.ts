/** Intelligence ops configuration — env-driven, stable defaults. */

export const INTELLIGENCE_API_VERSION = "1.0.0" as const;

export const intelligenceOpsConfig = {
  apiVersion: INTELLIGENCE_API_VERSION,
  maintenanceEnabled: process.env.INTELLIGENCE_MAINTENANCE !== "0",
  adversarialMinPassRate: Number(process.env.ADVERSARIAL_MIN_PASS_RATE ?? "1"),
  maxMemoryEntriesPerLayer: Number(process.env.INTELLIGENCE_MEMORY_MAX_PER_LAYER ?? "200"),
  circuitFailureThreshold: Number(process.env.AI_CIRCUIT_FAILURE_THRESHOLD ?? "3"),
  circuitCooldownMs: Number(process.env.AI_CIRCUIT_COOLDOWN_MS ?? "60000"),
  providerMaxRetries: Number(process.env.AI_PROVIDER_MAX_RETRIES ?? "2"),
  providerRetryBaseMs: Number(process.env.AI_PROVIDER_RETRY_BASE_MS ?? "250"),
  skipLlmWithoutGrounding:
    process.env.AI_SKIP_UNGROUNDED_LLM === "1",
} as const;
