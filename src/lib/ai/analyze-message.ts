import type { ChatHistoryMessage } from "./generate-reply";
import { detectClarificationNeeded } from "./clarify-intent";
import { detectHouseholdClarification } from "./category-clarify";
import { isObviousProductSearch } from "./product-query-specificity";
import { findBroadKeywordRule } from "./shopping-keywords";
import { parseSizeFromText } from "../shopping/sizes";
import type { ClarificationState } from "../types";
import { extractIntentFromMessage } from "./extract-intent";
import {
  mergeSearchIntent,
  shouldMergeWithPreviousSearch,
} from "../shopping/intent-merge";
import type { SessionState, ShoppingIntent } from "../types";
import { generateAIText, isGeminiConfigured, isClaudeConfigured } from "./index";

export interface MessageAnalysis {
  intent: Partial<ShoppingIntent>;
  needsClarification: boolean;
  clarification?: ClarificationState;
  clarifyQuestion?: string;
}

function mergeClarification(
  base: ClarificationState,
  aiQuestion?: string | null,
  aiOptions?: string[] | null,
): ClarificationState {
  const options =
    aiOptions?.filter((o) => o.trim().length > 0).slice(0, 6) ?? base.options;
  return {
    ...base,
    question: aiQuestion?.trim() || base.question,
    options: options.length >= 2 ? options : base.options,
  };
}

function isAiAvailable(): boolean {
  return isGeminiConfigured() || isClaudeConfigured();
}

async function callAIAnalysis(
  message: string,
  session: SessionState,
  history?: ChatHistoryMessage[],
  ruleClarify?: ClarificationState | null,
): Promise<Partial<MessageAnalysis> | null> {
  if (!isAiAvailable()) return null;

  const hist = (history ?? [])
    .slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
    .join("\n");

  const keywordHint = findBroadKeywordRule(message);
  const ruleHint = ruleClarify
    ? `Rule-based clarification already suggested: ${ruleClarify.question} Options: ${ruleClarify.options.join(", ")}`
    : keywordHint
      ? `Keyword detected (${keywordHint.id}): likely needs clarification — ${keywordHint.defaultQuestion}`
      : "No rule clarification yet.";

  const system = `You analyze shopping requests for Homivion (price comparison app). Return JSON only — no markdown, no code fences:
{
  "query": "normalized product search string",
  "category": "clothing|shoes|salad|dairy|produce|meat|pantry|bakery|null",
  "gender": "mens|womens|null",
  "product_subtype": "jeans|chinos|running_shoes|null",
  "needs_clarification": boolean,
  "clarification_question": "friendly natural question or null",
  "clarification_options": ["short tap label", ...] or null
}

Rules:
- Broad/vague requests NEED clarification: "salad", "salad bunches", "milk", "pants", "shoes", "kids pants", "hoodie", "chicken", "bread", "snacks" without subtype.
- Specific requests do NOT: "organic romaine hearts", "mens chino pants size 32", "caesar salad kit", "whole milk gallon".
- Match the user's words naturally (e.g. "salad bunches" → ask what kind of salad/greens).
- clarification_options: 4-6 short labels the user can tap.
- If a rule-based clarification was already detected, you may refine the question/options but keep needs_clarification=true unless the user was already specific.
${ruleHint}`;

  const userContent = `Session phase: ${session.phase}\nPrior query: ${session.intent?.query ?? "none"}\nHistory:\n${hist}\n\nNew message: "${message}"`;

  try {
    const result = await generateAIText(`${userContent}`, {
      system,
      temperature: 0.25,
      maxOutputTokens: 400,
      retries: 1,
      timeoutMs: 8_000,
    });

    // Strip possible markdown code fences
    const raw = result.text.replace(/^```[a-z]*\n?/i, "").replace(/```$/m, "").trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      query?: string;
      category?: string | null;
      gender?: string | null;
      product_subtype?: string | null;
      needs_clarification?: boolean;
      clarification_question?: string | null;
      clarification_options?: string[] | null;
    };

    const intent: Partial<ShoppingIntent> = {
      query: parsed.query ?? message,
      category: parsed.category ?? undefined,
      gender:
        parsed.gender === "mens" || parsed.gender === "womens" ?
          parsed.gender
        : undefined,
      productSubtype: parsed.product_subtype ?? undefined,
      zipCode: session.intent?.zipCode,
    };

    const wantsClarify =
      !isObviousProductSearch(message, intent) &&
      (parsed.needs_clarification === true || Boolean(ruleClarify));

    if (!wantsClarify) {
      return { intent, needsClarification: false };
    }

    const baseClarify =
      ruleClarify ??
      detectClarificationNeeded(intent.query ?? message, intent);

    if (!baseClarify) {
      const options = parsed.clarification_options?.filter(Boolean) ?? [];
      if (options.length < 2) {
        return { intent, needsClarification: false };
      }
      const clarification: ClarificationState = {
        kind: "pantry",
        question: parsed.clarification_question ?? "What exactly are you looking for?",
        options,
        baseQuery: intent.query ?? message,
        baseIntent: intent,
      };
      return {
        intent,
        needsClarification: true,
        clarification,
        clarifyQuestion: clarification.question,
      };
    }

    const clarification = mergeClarification(
      baseClarify,
      parsed.clarification_question,
      parsed.clarification_options,
    );

    return {
      intent,
      needsClarification: true,
      clarification,
      clarifyQuestion: clarification.question,
    };
  } catch {
    return null;
  }
}

/** Keyword rules + optional OpenAI — asks before searching when the request is broad. */
export async function analyzeShoppingMessage(
  message: string,
  session: SessionState,
  history?: ChatHistoryMessage[],
): Promise<MessageAnalysis> {
  if (shouldMergeWithPreviousSearch(message, session)) {
    return {
      intent: mergeSearchIntent(session.intent, message),
      needsClarification: false,
    };
  }

  const rulesIntent = extractIntentFromMessage(message, session.intent?.zipCode);
  const mergedRules: Partial<ShoppingIntent> = {
    zipCode: session.intent?.zipCode,
    ...rulesIntent,
    size:
      rulesIntent.size ??
      parseSizeFromText(message) ??
      undefined,
  };

  // Broad household staples ("paper towels", "detergent", "trash bags") are
  // checked BEFORE the obvious-search short-circuit: we want to ask how to narrow
  // a commodity category first rather than guess. A query that already carries a
  // brand / size / count / "cheapest" falls through (the rule's `specifics` gate)
  // and searches normally.
  const householdClarify = detectHouseholdClarification(
    mergedRules.query ?? message,
    mergedRules,
  );
  if (householdClarify) {
    return {
      intent: mergedRules,
      needsClarification: true,
      clarification: householdClarify,
      clarifyQuestion: householdClarify.question,
    };
  }

  if (isObviousProductSearch(message, mergedRules)) {
    return {
      intent: mergedRules,
      needsClarification: false,
    };
  }

  const ruleClarify = detectClarificationNeeded(
    mergedRules.query ?? message,
    mergedRules,
  );

  const ai = await callAIAnalysis(message, session, history, ruleClarify);

  if (ai) {
    if (ai.needsClarification && ai.clarification) {
      return {
        intent: {
          ...mergedRules,
          ...ai.intent,
          size: mergedRules.size ?? ai.intent?.size,
        },
        needsClarification: true,
        clarification: ai.clarification,
        clarifyQuestion: ai.clarifyQuestion ?? ai.clarification.question,
      };
    }
    return {
      intent: {
        ...mergedRules,
        ...ai.intent,
        size: mergedRules.size ?? ai.intent?.size,
      },
      needsClarification: false,
    };
  }

  if (ruleClarify) {
    return {
      intent: mergedRules,
      needsClarification: true,
      clarification: ruleClarify,
      clarifyQuestion: ruleClarify.question,
    };
  }

  return {
    intent: mergedRules,
    needsClarification: false,
  };
}
