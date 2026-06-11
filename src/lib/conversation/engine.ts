import {
  generateAssistantReply,
  type ChatHistoryMessage,
  type ReplyContext,
} from "../ai/generate-reply";
import type { ChatResponse, LearningProfile, SessionState } from "../types";
import { resolveChatTurn, type ResolvedChatTurn } from "./turn";

/**
 * Build the reply context for a resolved turn. Shared by the buffered
 * {@link processMessage} path and the streaming advice endpoint so both feed the
 * model the exact same context.
 */
export function buildReplyContext(
  message: string,
  turn: ResolvedChatTurn,
  history?: ChatHistoryMessage[],
): ReplyContext {
  return {
    userMessage: message.trim(),
    action: turn.action,
    clarifyQuestion: turn.clarifyQuestion,
    zipCode: turn.zipCode,
    query: turn.query ?? turn.session.intent.query,
    gender: turn.session.intent.gender,
    ageGroup: turn.session.intent.ageGroup,
    nearStores: turn.nearStores,
    productResults: turn.productResults,
    retrievalPayload: turn.retrievalPayload,
    commerceInsight: turn.commerceInsight ?? turn.productResults?.intelligenceInsight,
    referenceProductTitle: turn.referenceProductTitle,
    history,
    intent: turn.session.intent,
    adviceMode: turn.adviceMode,
  };
}

export async function processMessage(
  message: string,
  session: SessionState,
  zipCode?: string,
  learningProfile?: LearningProfile,
  history?: ChatHistoryMessage[],
  userId?: string,
  progressive = true,
): Promise<ChatResponse> {
  const turn = await resolveChatTurn(
    message,
    session,
    zipCode,
    learningProfile,
    userId,
    history,
    progressive,
  );

  const reply = await generateAssistantReply(
    buildReplyContext(message, turn, history),
  );

  return {
    reply,
    resolvedQuery: turn.query ?? turn.session.intent.query,
    chips: turn.chips,
    productResults: turn.productResults,
    commerceInsight: turn.commerceInsight ?? turn.productResults?.intelligenceInsight,
    compareMode: turn.compareMode,
    session: turn.session,
    conversationDebug: turn.conversationDebug,
  };
}

export { defaultSession } from "./default-session";
