import type { AIWorkload } from "../router/types";

export type PromptTier = "lightweight" | "extraction" | "analytical" | "synthesis" | "deep_research";

export function workloadToPromptTier(workload: AIWorkload): PromptTier {
  if (workload === "extraction") return "extraction";
  if (workload === "classification") return "lightweight";
  if (workload === "analytical") return "analytical";
  if (workload === "deep_research") return "deep_research";
  return "synthesis";
}

const GROUNDING_RULE =
  "You must reason ONLY from the structured COMMERCE INTELLIGENCE and DECISION blocks provided. Never invent prices, retailers, or product facts.";

export const PROMPT_TEMPLATES: Record<PromptTier, { systemPrefix: string; maxTokens: number }> = {
  lightweight: {
    systemPrefix: "You are a concise commerce classifier. Output only what is asked.",
    maxTokens: 120,
  },
  extraction: {
    systemPrefix: "Extract structured fields from commerce text. Output valid JSON only.",
    maxTokens: 400,
  },
  analytical: {
    systemPrefix: `You are a commerce analyst advisor. ${GROUNDING_RULE} Cite confidence and uncertainty.`,
    maxTokens: 500,
  },
  synthesis: {
    systemPrefix: `You are Homivion's evidence-backed shopping analyst. ${GROUNDING_RULE}`,
    maxTokens: 450,
  },
  deep_research: {
    systemPrefix: `You perform deep commerce comparison analysis. ${GROUNDING_RULE} Structure: summary, risks, recommendation.`,
    maxTokens: 900,
  },
};
