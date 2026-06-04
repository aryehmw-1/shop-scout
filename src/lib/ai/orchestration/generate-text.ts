import { createHash } from "node:crypto";
import { verifyRetailerGrounding } from "../contracts/validate";
import { PROMPT_TEMPLATES, workloadToPromptTier } from "../prompts/tiers";
import { getProvider, listAvailableProviders } from "../providers/registry";
import type { AIMessage, GenerateResult } from "../providers/types";
import { estimateCostUsd, logRouteDecision, recordInferenceMetric } from "../router/instrumentation";
import { recordEscalationOutcome, recordRecommendationCall } from "../router/metrics-persist";
import { generateWithResilience } from "../router/resilience";
import { planRoute } from "../router/capabilities";
import type { AIWorkload, RoutedGenerateMeta } from "../router/types";
import { intelligenceOpsConfig } from "@/lib/commerce-intelligence/ops/config";

const responseCache = new Map<string, GenerateResult>();

function cacheKey(messages: AIMessage[], workload: AIWorkload, model: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ messages, workload, model }))
    .digest("hex");
}

export interface OrchestratedGenerateRequest {
  workload: AIWorkload;
  messages: AIMessage[];
  /** Structured grounding — if set, LLM is augmentation only */
  groundedPayload?: string;
  allowedRetailers?: string[];
  requireHighQuality?: boolean;
  skipCache?: boolean;
}

export interface OrchestratedGenerateResponse {
  text: string | null;
  meta: RoutedGenerateMeta;
  groundingOk: boolean;
  groundingErrors: string[];
}

function shouldEscalate(result: GenerateResult | null): boolean {
  if (!result?.text) return true;
  if (result.text.length < 40) return true;
  if (/I don't have|cannot determine|no information/i.test(result.text)) return true;
  return false;
}

/**
 * Retrieval-first orchestration: optional cache → route → generate → escalate → ground verify.
 */
export async function orchestratedGenerate(
  req: OrchestratedGenerateRequest,
): Promise<OrchestratedGenerateResponse> {
  if (
    intelligenceOpsConfig.skipLlmWithoutGrounding &&
    !req.groundedPayload &&
    req.workload !== "extraction" &&
    req.workload !== "classification"
  ) {
    return {
      text: null,
      meta: {
        plan: planRoute({ workload: req.workload }),
        escalated: false,
        cacheHit: false,
      },
      groundingOk: true,
      groundingErrors: [],
    };
  }

  recordRecommendationCall();

  const plan = planRoute({
    workload: req.workload,
    requireHighQuality: req.requireHighQuality,
  });
  logRouteDecision(plan, false);

  const tier = workloadToPromptTier(req.workload);
  const template = PROMPT_TEMPLATES[tier];

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `${template.systemPrefix}${req.groundedPayload ? `\n\n---\n${req.groundedPayload}` : ""}`,
    },
    ...req.messages.filter((m) => m.role !== "system"),
  ];

  const key = cacheKey(messages, req.workload, plan.model);
  if (!req.skipCache && responseCache.has(key)) {
    const cached = responseCache.get(key)!;
    recordInferenceMetric({
      provider: cached.provider,
      model: cached.model,
      workload: req.workload,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      escalated: false,
      cacheHit: true,
    });
    return {
      text: cached.text,
      meta: { plan, escalated: false, cacheHit: true },
      groundingOk: true,
      groundingErrors: [],
    };
  }

  let provider = getProvider(plan.provider);
  let result =
    provider ?
      await generateWithResilience(provider, messages, {
        model: plan.model,
        maxTokens: template.maxTokens,
      })
    : null;

  let escalated = false;
  const firstWeak = shouldEscalate(result);
  if (firstWeak && plan.escalateTo) {
    escalated = true;
    const escProvider = getProvider(plan.escalateTo.provider);
    const escalatedResult =
      escProvider ?
        await generateWithResilience(escProvider, messages, {
          model: plan.escalateTo.model,
          maxTokens: template.maxTokens + 200,
        })
      : null;
    recordEscalationOutcome(Boolean(escalatedResult?.text) && firstWeak);
    result = escalatedResult ?? result;
    logRouteDecision({ ...plan, ...plan.escalateTo }, true);
  }

  if (!result?.text) {
    for (const id of listAvailableProviders()) {
      if (id === plan.provider || id === plan.escalateTo?.provider) continue;
      const fallback = getProvider(id);
      if (!fallback) continue;
      const attempt = await generateWithResilience(fallback, messages, {
        maxTokens: template.maxTokens,
      });
      if (attempt?.text) {
        result = attempt;
        break;
      }
    }
  }

  if (result && !req.skipCache) {
    responseCache.set(key, result);
  }

  if (result) {
    recordInferenceMetric({
      provider: result.provider,
      model: result.model,
      workload: req.workload,
      latencyMs: result.latencyMs,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      escalated,
      cacheHit: false,
      estimatedCostUsd: estimateCostUsd(
        result.model,
        result.usage?.inputTokens ?? 0,
        result.usage?.outputTokens ?? 0,
      ),
    });
  }

  let groundingOk = true;
  let groundingErrors: string[] = [];
  if (result?.text && req.allowedRetailers?.length) {
    const check = verifyRetailerGrounding(result.text, req.allowedRetailers);
    groundingOk = check.ok;
    groundingErrors = check.errors;
  }

  return {
    text: result?.text ?? null,
    meta: {
      plan,
      escalated,
      cacheHit: false,
      estimatedCostUsd: result ?
        estimateCostUsd(result.model, result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0)
      : undefined,
    },
    groundingOk,
    groundingErrors,
  };
}
