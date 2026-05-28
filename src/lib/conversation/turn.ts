import { getStoresNearZip } from "../retailers/catalog";
import { searchService } from "../search/search-service";
import { parseProductUrl } from "../matching/url-parser";
import { parseQueryAttributes } from "../retailers/search";
import { inferFromLearning } from "../learning/preference-learner";
import type { ChatAction } from "../ai/generate-reply";
import type { ChatHistoryMessage } from "../ai/generate-reply";
import { analyzeShoppingMessage } from "../ai/analyze-message";
import {
  isClarifyFollowUpQuestion,
  isLikelyClarificationAnswer,
  resolveClarificationAnswer,
} from "../ai/clarify-intent";
import { clarifyHelpReply } from "../ai/category-clarify";
import { extractIntentFromMessage } from "../ai/extract-intent";
import { parseSizeFromText } from "../shopping/sizes";
import {
  isRefinementMessage,
  mergeSearchIntent,
} from "../shopping/intent-merge";
import { looksLikeShoppingQuery, stripShoppingPrefixes } from "../shopping/query";
import type {
  LearningProfile,
  ProductSearchResults,
  SessionState,
  ShoppingIntent,
} from "../types";

const URL_REGEX = /https?:\/\/[^\s]+/gi;
const GREETING = /^(hi|hello|hey|thanks|thank you|ok|okay|yo|howdy|good (morning|afternoon|evening))$/i;

export function extractUrl(text: string): string | null {
  const match = text.match(URL_REGEX);
  return match ? match[0].replace(/[.,)]+$/, "") : null;
}

export function isValidZip(zip: string): boolean {
  return /^\d{5}$/.test(zip);
}

function normalizeQuery(raw: string): string {
  return stripShoppingPrefixes(
    raw
      .replace(
        /i'?m looking for|i need|i want|cheapest|where can i get|compare this product:?/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function buildIntentFromQuery(query: string): Partial<ShoppingIntent> {
  const normalized = normalizeQuery(query) || query;
  const base = extractIntentFromMessage(normalized);
  const size = parseSizeFromText(normalized);
  return size ? { ...base, size } : base;
}

export function enrichIntent(
  intent: Partial<ShoppingIntent>,
  learningProfile?: LearningProfile,
): ShoppingIntent {
  const learned = inferFromLearning(learningProfile, intent.query ?? "");
  const attrs = parseQueryAttributes(intent.query ?? "");
  const ageGroup = intent.ageGroup ?? learned.ageGroup ?? attrs.ageGroup;
  let category = intent.category;
  if (
    !category &&
    ageGroup &&
    (ageGroup === "toddler" || ageGroup === "kids") &&
    !/\b(book|novel|milk|egg|salad|produce|meat|snack)\b/i.test(intent.query ?? "")
  ) {
    category = "clothing";
  }

  return {
    query: intent.query ?? "",
    category,
    organic: intent.organic,
    maxPrice: intent.maxPrice,
    zipCode: intent.zipCode,
    gender: intent.gender ?? learned.gender,
    ageGroup,
    brand: intent.brand,
    colors: intent.colors ?? (attrs.colors.length ? attrs.colors : undefined),
    size: intent.size ?? parseSizeFromText(intent.query ?? ""),
    productSubtype: intent.productSubtype,
    learningProfile,
  };
}

function isRecheckMessage(text: string): boolean {
  return /recheck|check again|refresh|try again|search again|look again|run it again|update (the )?results|update prices|new search|run (that|it) again/i.test(
    text,
  );
}

function isFollowUpAboutResults(text: string): boolean {
  return /which (one|store|deal)|cheaper|better deal|best (deal|price|option)|compare these|what do you recommend|worth it|should i buy/i.test(
    text,
  );
}

function isProductSearchMessage(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || isValidZip(t) || GREETING.test(t)) return false;
  if (extractUrl(t)) return false;
  if (isRecheckMessage(t) || isFollowUpAboutResults(t)) return false;
  if (/^(help|how does this work|\?)$/i.test(t)) return false;
  if (looksLikeShoppingQuery(t)) return true;
  return t.length >= 3;
}

function isConversationalOnly(text: string): boolean {
  const t = text.trim();
  if (looksLikeShoppingQuery(t)) return false;
  if (GREETING.test(t)) return true;
  if (/^thanks|thank you|thx$/i.test(t)) return true;
  if (/^help$|how (does|do) (this|shop scout) work/i.test(t)) return true;
  if (isFollowUpAboutResults(t)) return true;
  if (t.length < 12 && !/\d/.test(t)) return true;
  return false;
}

export interface ResolvedChatTurn {
  action: ChatAction;
  session: SessionState;
  productResults?: ProductSearchResults;
  compareMode: boolean;
  chips?: string[];
  zipCode: string;
  query?: string;
  nearStores?: string[];
  referenceProductTitle?: string;
  clarifyQuestion?: string;
}

export async function resolveChatTurn(
  message: string,
  session: SessionState,
  zipCode?: string,
  learningProfile?: LearningProfile,
  userId?: string,
  history?: ChatHistoryMessage[],
): Promise<ResolvedChatTurn> {
  const text = message.trim();
  let { intent, asked, phase, sourceUrl, sourceProductTitle, compareMode } = session;
  let zip = zipCode ?? intent.zipCode ?? "";

  if (isValidZip(text)) {
    zip = text;
    intent = { ...intent, zipCode: zip };
    const near = getStoresNearZip(zip);
    return {
      action: "set_zip",
      session: { phase: "idle", intent, asked: ["location"], compareMode: false },
      compareMode: false,
      zipCode: zip,
      nearStores: near,
      chips: ["Womens black hoodie", "Organic milk", "Toddler sneakers", "Compare a product link"],
    };
  }

  if (!isValidZip(zip)) {
    return {
      action: "need_zip",
      session: { phase: "idle", intent, asked: [] },
      compareMode: false,
      zipCode: "",
    };
  }

  const url = extractUrl(text);
  if (url) {
    const parsed = parseProductUrl(url);
    if (!parsed) {
      return {
        action: "invalid_link",
        session: { phase: "idle", intent: { zipCode: zip }, asked: [] },
        compareMode: false,
        zipCode: zip,
      };
    }

    sourceUrl = url;
    sourceProductTitle = parsed.guessedTitle;
    intent = {
      query: parsed.guessedTitle,
      zipCode: zip,
      ...(parsed.category ? { category: parsed.category } : {}),
    };

    const fullIntent = enrichIntent({ ...intent, zipCode: zip }, learningProfile);
    const productResults = await searchService.searchFromLink(
      {
        guessedTitle: parsed.guessedTitle,
        category: parsed.category,
        referencePrice: parsed.referencePrice,
        sourceUrl: url,
        sourceRetailer: parsed.sourceRetailer,
        catalogId: parsed.catalogId,
      },
      fullIntent,
      { userId },
    );

    return {
      action: "link_search",
      session: {
        phase: "ready",
        intent,
        asked: ["url"],
        sourceUrl,
        sourceProductTitle,
        compareMode: false,
      },
      productResults,
      compareMode: false,
      zipCode: zip,
      query: parsed.guessedTitle,
      referenceProductTitle: parsed.guessedTitle,
    };
  }

  const fullIntentFromSession = () =>
    enrichIntent({ ...intent, zipCode: zip }, learningProfile);

  if (
    phase === "ready" &&
    (isRecheckMessage(text) || /cheaper|again|refresh/i.test(text))
  ) {
    const fullIntent = fullIntentFromSession();
    const productResults = sourceUrl
      ? await searchService.searchFromLink(
          {
            guessedTitle: sourceProductTitle ?? fullIntent.query,
            category: fullIntent.category,
            referencePrice: fullIntent.maxPrice ?? 49.99,
            sourceUrl,
          },
          fullIntent,
          { userId },
        )
      : await searchService.search(fullIntent, { userId });

    return {
      action: "recheck",
      session,
      productResults,
      compareMode: false,
      zipCode: zip,
      query: fullIntent.query,
      referenceProductTitle: sourceProductTitle,
      chips: ["Recheck prices", "Try a different product", "Mens jeans"],
    };
  }

  if (phase === "ready" && isRefinementMessage(text, session)) {
    intent = mergeSearchIntent(session.intent, text);
    const fullIntent = enrichIntent({ ...intent, zipCode: zip }, learningProfile);
    const productResults = await searchService.search(fullIntent, { userId });

    return {
      action: "refine",
      session: {
        phase: "ready",
        intent: fullIntent,
        asked,
        sourceUrl,
        sourceProductTitle,
        compareMode: false,
      },
      productResults,
      compareMode: false,
      zipCode: zip,
      query: fullIntent.query,
      chips: ["Size large", "In navy", "From Nike", "Recheck prices"],
    };
  }

  if (phase === "ready" && isFollowUpAboutResults(text)) {
    const fullIntent = fullIntentFromSession();
    const productResults = await searchService.search(fullIntent, { userId });
    return {
      action: "conversational",
      session,
      productResults,
      compareMode: false,
      zipCode: zip,
      query: fullIntent.query,
    };
  }

  if (isConversationalOnly(text) && !isProductSearchMessage(text)) {
    const fullIntent =
      phase === "ready" && intent.query ? fullIntentFromSession() : undefined;
    const productResults =
      fullIntent && isFollowUpAboutResults(text)
        ? await searchService.search(fullIntent, { userId })
        : undefined;

    return {
      action: "conversational",
      session: { phase: phase === "ready" ? "ready" : "idle", intent: { zipCode: zip, ...intent }, asked, sourceUrl, sourceProductTitle, compareMode: false },
      productResults,
      compareMode: false,
      zipCode: zip,
      query: intent.query,
      chips: zip
        ? ["Womens hoodie", "Cheapest eggs", "Recheck prices", "Compare a product link"]
        : undefined,
    };
  }

  if (phase === "clarifying" && session.clarifying) {
    if (isClarifyFollowUpQuestion(text)) {
      return {
        action: "clarify",
        session: {
          phase: "clarifying",
          intent: session.intent,
          asked,
          clarifying: session.clarifying,
          compareMode: false,
        },
        compareMode: false,
        zipCode: zip,
        chips: session.clarifying.options,
        clarifyQuestion: clarifyHelpReply(session.clarifying),
      };
    }

    const resolved = resolveClarificationAnswer(text, session.clarifying);
    if (resolved) {
      const fullIntent = enrichIntent(
        { ...resolved, zipCode: zip, learningProfile },
        learningProfile,
      );
      const productResults = await searchService.search(fullIntent, { userId });
      return {
        action: "search",
        session: {
          phase: "ready",
          intent: fullIntent,
          asked: [...asked, "clarify"],
          sourceUrl,
          sourceProductTitle,
          compareMode: false,
        },
        productResults,
        compareMode: false,
        zipCode: zip,
        query: fullIntent.query,
        chips: ["Recheck prices", "Size large", "In black"],
      };
    }

    const answerWords = text.trim().split(/\s+/).filter(Boolean).length;
    if (
      isProductSearchMessage(text) &&
      (answerWords >= 2 ||
        text.length > 12 ||
        !isLikelyClarificationAnswer(text, session.clarifying))
    ) {
      intent = { ...buildIntentFromQuery(text), zipCode: zip };
      const fullIntent = enrichIntent(intent, learningProfile);
      const productResults = await searchService.search(fullIntent, { userId });
      return {
        action: "search",
        session: {
          phase: "ready",
          intent: fullIntent,
          asked: [...asked, "clarify"],
          sourceUrl,
          sourceProductTitle,
          compareMode: false,
        },
        productResults,
        compareMode: false,
        zipCode: zip,
        query: fullIntent.query,
        chips: ["Recheck prices", "Show something cheaper"],
      };
    }

    return {
      action: "clarify",
      session: { phase: "clarifying", intent, asked, clarifying: session.clarifying, compareMode: false },
      compareMode: false,
      zipCode: zip,
      chips: session.clarifying.options,
      clarifyQuestion: session.clarifying.question,
    };
  }

  const shouldSearch =
    isProductSearchMessage(text) || (phase === "ready" && !GREETING.test(text));

  if (shouldSearch) {
    if (
      phase === "ready" &&
      session.intent?.query &&
      isRefinementMessage(text, { phase, intent: session.intent, asked, compareMode: false })
    ) {
      intent = mergeSearchIntent(session.intent, text);
    } else if (phase !== "ready" || !compareMode) {
      intent = { ...buildIntentFromQuery(text), zipCode: zip };
    } else {
      intent = { ...intent, ...buildIntentFromQuery(text), zipCode: zip };
    }

    const analysis = await analyzeShoppingMessage(
      text,
      { phase, intent, asked, compareMode, clarifying: session.clarifying },
      history,
    );

    if (analysis.needsClarification && analysis.clarification) {
      return {
        action: "clarify",
        session: {
          phase: "clarifying",
          intent: { ...analysis.intent, zipCode: zip },
          asked: [...asked, "clarify"],
          clarifying: analysis.clarification,
          compareMode: false,
        },
        compareMode: false,
        zipCode: zip,
        chips: analysis.clarification.options,
        clarifyQuestion: analysis.clarifyQuestion ?? analysis.clarification.question,
      };
    }

    const fullIntent = enrichIntent(
      { ...intent, ...analysis.intent, zipCode: zip },
      learningProfile,
    );
    const productResults = await searchService.search(fullIntent, { userId });

    return {
      action: "search",
      session: {
        phase: "ready",
        intent: fullIntent,
        asked,
        sourceUrl,
        sourceProductTitle,
        compareMode: false,
      },
      productResults,
      compareMode: false,
      zipCode: zip,
      query: fullIntent.query,
      chips: ["Recheck prices", "Show something cheaper", "Compare a product link"],
    };
  }

  return {
    action: "conversational",
    session: { phase: "idle", intent: { zipCode: zip }, asked: [] },
    compareMode: false,
    zipCode: zip,
    chips: ["Running shoes", "Organic milk", "Mens jeans", "Compare a product link"],
  };
}
