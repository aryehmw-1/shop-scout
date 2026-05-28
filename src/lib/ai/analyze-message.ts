import type { ChatHistoryMessage } from "./generate-reply";
import { detectClarificationNeeded } from "./clarify-intent";
import { findBroadKeywordRule } from "./shopping-keywords";
import { parseSizeFromText } from "../shopping/sizes";
import type { ClarificationState } from "../types";
import { extractIntentFromMessage } from "./extract-intent";
import type { SessionState, ShoppingIntent } from "../types";

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

async function callOpenAIAnalysis(
  message: string,
  session: SessionState,
  history?: ChatHistoryMessage[],
  ruleClarify?: ClarificationState | null,
): Promise<Partial<MessageAnalysis> | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

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

  const system = `You analyze shopping requests for Shop Scout (price comparison app). Return JSON only:
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

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Session phase: ${session.phase}\nPrior query: ${session.intent?.query ?? "none"}\nHistory:\n${hist}\n\nNew message: "${message}"`,
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
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
      parsed.needs_clarification === true ||
      Boolean(ruleClarify) ||
      Boolean(findBroadKeywordRule(message));

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
  const rulesIntent = extractIntentFromMessage(message, session.intent?.zipCode);
  const mergedRules = {
    ...session.intent,
    ...rulesIntent,
    size:
      rulesIntent.size ??
      parseSizeFromText(message) ??
      session.intent?.size,
  };

  const ruleClarify = detectClarificationNeeded(
    mergedRules.query ?? message,
    mergedRules,
  );

  const ai = await callOpenAIAnalysis(message, session, history, ruleClarify);

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
