/**
 * Conversational search debug — refinement merge visibility.
 */

import type { SessionState, ShoppingIntent } from "../types";
import { buildFullSearchQuery } from "../shopping/intent-merge";

export interface ConversationDebugSnapshot {
  action: string;
  message: string;
  merged: boolean;
  priorQuery?: string;
  nextQuery: string;
  intent: Partial<ShoppingIntent>;
  fullQuery: string;
  attributes: {
    gender?: string;
    size?: string;
    brand?: string;
    colors?: string[];
    maxPrice?: number;
    productSubtype?: string;
  };
}

export function buildConversationDebugSnapshot(input: {
  action: string;
  message: string;
  priorSession: SessionState;
  nextSession: SessionState;
  merged: boolean;
}): ConversationDebugSnapshot {
  const intent = input.nextSession.intent;
  const full = enrichMinimalIntent(intent);

  return {
    action: input.action,
    message: input.message,
    merged: input.merged,
    priorQuery: input.priorSession.intent?.query,
    nextQuery: intent.query ?? "",
    intent,
    fullQuery: buildFullSearchQuery(full),
    attributes: {
      gender: intent.gender,
      size: intent.size,
      brand: intent.brand,
      colors: intent.colors,
      maxPrice: intent.maxPrice,
      productSubtype: intent.productSubtype,
    },
  };
}

function enrichMinimalIntent(partial: Partial<ShoppingIntent>): ShoppingIntent {
  return {
    query: partial.query ?? "",
    zipCode: partial.zipCode ?? "78701",
    category: partial.category,
    gender: partial.gender,
    ageGroup: partial.ageGroup,
    brand: partial.brand,
    colors: partial.colors,
    size: partial.size,
    maxPrice: partial.maxPrice,
    productSubtype: partial.productSubtype,
    organic: partial.organic,
  };
}

export function conversationDebugEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_SEARCH_DEBUG?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}
