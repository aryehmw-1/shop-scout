import "server-only";

// AI-Assisted Validation — a SUPPLEMENT to rule-based matching, never the sole
// source of truth. Only invoked when structured fields are too thin to decide
// (no UPC, no model number, medium title similarity). The model is told to be
// conservative and must return strict JSON. It can never override a hard
// conflict (different UPC / model / size / quantity / variant).

import { generateAIText, isGeminiConfigured, isClaudeConfigured } from "../ai";
import { criticalDifferences } from "./category-rules";
import type { AiMatchResult, NormalizedListing } from "./types";

const SYSTEM = `You verify whether two retail listings are the EXACT same purchasable product.
Compare brand, title, model, size, quantity, count, color, variant, packaging, and category.
Be conservative: if uncertain, return same_product=false. Do NOT treat similar titles as
identical. Never claim a match across different size, quantity, count, color, or variant.
Return ONLY valid JSON, no prose.`;

const PROMPT_INSTRUCTION = `Determine whether these listings represent the exact same purchasable product,
including brand, model, size, color, quantity, count, packaging, and variant. Be conservative.
If uncertain, return false. Respond with JSON exactly:
{"same_product": false, "confidence": 0, "reason": "", "critical_differences": [], "fields_checked": []}`;

function isAiEnabled(): boolean {
  return isGeminiConfigured() || isClaudeConfigured();
}

function describe(l: NormalizedListing): Record<string, unknown> {
  return {
    retailer: l.retailer,
    title: l.title,
    brand: l.brand,
    model_number: l.modelNumber,
    upc: l.upc ?? l.gtin ?? l.ean,
    size: l.sizeNormalized ?? l.size,
    pack_count: l.packCount,
    color: l.color,
    variant: l.variant,
    category: l.category,
  };
}

/**
 * Ask the model whether two listings are the same product. Hard conflicts are
 * checked FIRST in code — if any exist, we short-circuit to false and never call
 * the model (and the model could not override them anyway).
 */
export async function aiValidateMatch(
  a: NormalizedListing,
  b: NormalizedListing,
): Promise<AiMatchResult> {
  const hard = criticalDifferences(a, b);
  if (hard.length) {
    return {
      same_product: false,
      confidence: 0,
      reason: `Hard conflict: ${hard.join(", ")}`,
      critical_differences: hard,
      fields_checked: ["upc", "model", "size", "pack", "color", "variant"],
    };
  }
  if (!isAiEnabled()) {
    return {
      same_product: false,
      confidence: 0,
      reason: "AI not configured; cannot supplement.",
      critical_differences: [],
      fields_checked: [],
    };
  }

  const prompt = `${PROMPT_INSTRUCTION}

Listing A:
${JSON.stringify(describe(a), null, 2)}

Listing B:
${JSON.stringify(describe(b), null, 2)}`;

  try {
    const { text } = await generateAIText(prompt, {
      system: SYSTEM,
      temperature: 0,
      maxOutputTokens: 400,
      thinkingBudget: 0,
      timeoutMs: 12_000,
    });
    const parsed = parseJson(text);
    if (!parsed) {
      return blank("AI returned unparseable output.");
    }
    // Even if the model says yes, re-assert hard conflicts can't be overridden.
    if (parsed.same_product && criticalDifferences(a, b).length) {
      return blank("AI match rejected by hard-conflict guard.");
    }
    return parsed;
  } catch {
    return blank("AI validation error.");
  }
}

function blank(reason: string): AiMatchResult {
  return { same_product: false, confidence: 0, reason, critical_differences: [], fields_checked: [] };
}

function parseJson(text: string): AiMatchResult | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as Partial<AiMatchResult>;
    return {
      same_product: Boolean(obj.same_product),
      confidence: clampPct(Number(obj.confidence ?? 0)),
      reason: String(obj.reason ?? ""),
      critical_differences: Array.isArray(obj.critical_differences)
        ? obj.critical_differences.map(String)
        : [],
      fields_checked: Array.isArray(obj.fields_checked) ? obj.fields_checked.map(String) : [],
    };
  } catch {
    return null;
  }
}

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
