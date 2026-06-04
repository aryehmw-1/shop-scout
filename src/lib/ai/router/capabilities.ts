import type { AIProviderId } from "../providers/types";
import type { AIWorkload, RoutePlan, RouteRequest } from "./types";

const WORKLOAD_DEFAULTS: Record<
  AIWorkload,
  { tier: RoutePlan["tier"]; provider: AIProviderId; modelEnv: string; fallbackModel: string }
> = {
  extraction: {
    tier: "lightweight",
    provider: "openai",
    modelEnv: "AI_MODEL_EXTRACTION",
    fallbackModel: "gpt-4o-mini",
  },
  classification: {
    tier: "lightweight",
    provider: "openai",
    modelEnv: "AI_MODEL_CLASSIFICATION",
    fallbackModel: "gpt-4o-mini",
  },
  analytical: {
    tier: "standard",
    provider: "anthropic",
    modelEnv: "AI_MODEL_ANALYTICAL",
    fallbackModel: "claude-3-5-haiku-latest",
  },
  synthesis: {
    tier: "standard",
    provider: "openai",
    modelEnv: "AI_MODEL_SYNTHESIS",
    fallbackModel: "gpt-4o",
  },
  deep_research: {
    tier: "premium",
    provider: "openai",
    modelEnv: "AI_MODEL_DEEP",
    fallbackModel: "gpt-4o",
  },
};

function modelFromEnv(envKey: string, fallback: string): string {
  return process.env[envKey]?.trim() || fallback;
}

export function planRoute(request: RouteRequest): RoutePlan {
  const def = WORKLOAD_DEFAULTS[request.workload];
  let provider = (process.env.AI_PROVIDER_FOR_ANALYTICAL ?? def.provider) as AIProviderId;
  if (request.workload === "extraction" || request.workload === "classification") {
    provider = (process.env.AI_PROVIDER_FAST ?? "openai") as AIProviderId;
  }
  if (request.workload === "deep_research") {
    provider = (process.env.AI_PROVIDER_DEEP ?? provider) as AIProviderId;
  }

  const model = modelFromEnv(def.modelEnv, def.fallbackModel);
  const escalateModel = modelFromEnv("AI_MODEL_ESCALATION", "gpt-4o");

  const plan: RoutePlan = {
    workload: request.workload,
    provider,
    model: request.requireHighQuality && def.tier !== "premium" ? escalateModel : model,
    tier: request.requireHighQuality ? "premium" : def.tier,
    reason: `Default route for ${request.workload}`,
  };

  if (
    !request.requireHighQuality &&
    (request.workload === "analytical" || request.workload === "synthesis")
  ) {
    plan.escalateTo = {
      provider: (process.env.AI_PROVIDER_ESCALATION ?? "openai") as AIProviderId,
      model: escalateModel,
    };
  }

  return plan;
}
