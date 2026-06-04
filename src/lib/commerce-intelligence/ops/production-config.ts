import { intelligenceOpsConfig } from "./config";

export interface ProductionConfigReport {
  valid: boolean;
  environment: string;
  warnings: string[];
  errors: string[];
  deploymentDefaults: Record<string, string | boolean | number>;
}

/** Deployment-safe checks — call at boot, health, or cron. */
export function validateProductionConfig(): ProductionConfigReport {
  const env = process.env.NODE_ENV ?? "development";
  const isProd = env === "production";
  const warnings: string[] = [];
  const errors: string[] = [];

  if (isProd && !process.env.CRON_SECRET?.trim()) {
    warnings.push("CRON_SECRET unset — cron routes are unauthenticated");
  }

  if (intelligenceOpsConfig.adversarialMinPassRate < 0.5 || intelligenceOpsConfig.adversarialMinPassRate > 1) {
    errors.push("ADVERSARIAL_MIN_PASS_RATE must be between 0.5 and 1");
  }

  if (intelligenceOpsConfig.maxMemoryEntriesPerLayer < 20) {
    warnings.push("INTELLIGENCE_MEMORY_MAX_PER_LAYER is very low — memory may churn");
  }

  if (isProd && process.env.AI_USE_ROUTER === "1" && !process.env.OPENAI_API_KEY?.trim()) {
    const hasAlt =
      process.env.ANTHROPIC_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim();
    if (!hasAlt) {
      warnings.push("AI_USE_ROUTER=1 but no provider API keys — chat will use deterministic fallbacks only");
    }
  }

  if (isProd && !process.env.ALLOW_DEBUG_ROUTES) {
    warnings.push("ALLOW_DEBUG_ROUTES unset — debug APIs return 404 in production (expected)");
  }

  const deploymentDefaults: Record<string, string | boolean | number> = {
    INTELLIGENCE_MAINTENANCE: intelligenceOpsConfig.maintenanceEnabled,
    AI_SKIP_UNGROUNDED_LLM: intelligenceOpsConfig.skipLlmWithoutGrounding,
    ADVERSARIAL_MIN_PASS_RATE: intelligenceOpsConfig.adversarialMinPassRate,
    intelligenceApiVersion: intelligenceOpsConfig.apiVersion,
  };

  return {
    valid: errors.length === 0,
    environment: env,
    warnings,
    errors,
    deploymentDefaults,
  };
}
