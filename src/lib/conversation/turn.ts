import { getStoresNearZip } from "../retailers/catalog";
import { searchService } from "../search/search-service";
import { tryIntelligenceSearch } from "../commerce-intelligence/retrieval/intelligence-search";
import type { CommerceRetrievalPayload } from "../commerce-intelligence/ai/retrieval-payload";
import { parseProductUrl } from "../matching/url-parser";
import { ingestLinkProduct } from "../matching/link-ingest";
import { recordAnalyticsEvent } from "../analytics/record";
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
  classifyIntentTransition,
  mergeSearchIntent,
  shouldMergeWithPreviousSearch,
} from "../shopping/intent-merge";
import { looksLikeShoppingQuery, stripShoppingPrefixes } from "../shopping/query";
import {
  buildConversationDebugSnapshot,
  conversationDebugEnabled,
} from "../conversation/conversation-debug";
import { DEFAULT_CHAT_CHIPS, GROCERY_DEMO_CHIPS } from "../inventory/demo-suggestions";
import { getDynamicOnboardingChips } from "../inventory/onboarding-examples";
import type {
  ConversationDebugSnapshot,
  IntelligenceInsight,
  LearningProfile,
  ProductSearchResults,
  SessionState,
  ShoppingIntent,
} from "../types";

const URL_REGEX = /https?:\/\/[^\s]+/gi;
const GREETING = /^(hi|hello|hey|thanks|thank you|ok|okay|yo|howdy|good (morning|afternoon|evening))$/i;

function searchOpts(userId?: string, progressive = true) {
  return { userId, fastOnly: progressive };
}

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

/**
 * Questions about the assistant/service itself ("what do you do?", "who are
 * you?", "how does this work?", "are you an AI?"). These are NOT product
 * searches and must not hit the inventory-miss path.
 */
function isMetaQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /\bwhat (do|can) (you|this|homivion|it)\b.{0,20}\b(do|help|find|search|offer)/.test(t) ||
    /\bwhat('s| is| are)\b.{0,20}\b(this|you|homivion|your (purpose|job|name|deal))/.test(t) ||
    /\bwho are you\b/.test(t) ||
    /\bhow (do(es)?|you|this|it|homivion).{0,30}\bwork\b/.test(t) ||
    /\btell me (how|about|more about).{0,30}(you|homivion|this|it)\b/.test(t) ||
    /\bexplain (how|what).{0,30}(you|homivion|this|it)\b/.test(t) ||
    /\bwhat can you do\b/.test(t) ||
    /\bwhat do you do\b/.test(t) ||
    /\bare you (an? )?(ai|bot|robot|human|real|person)\b/.test(t) ||
    /\bwhat (kind|type) of (site|app|tool|service|thing) (is|are) (this|you)\b/.test(t) ||
    /\bcan you (tell|explain|describe|help me understand).{0,30}(how|what) (you|this|it|homivion)\b/.test(t) ||
    /\bwhat('s| is) homivion\b/.test(t) ||
    /\babout (you|homivion|this app|this site|this tool)\b/.test(t)
  );
}

function isProductSearchMessage(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || isValidZip(t) || GREETING.test(t)) return false;
  if (extractUrl(t)) return false;
  if (isRecheckMessage(t) || isFollowUpAboutResults(t)) return false;
  if (/^(help|how does this work|\?)$/i.test(t)) return false;
  if (isMetaQuestion(t)) return false;
  if (looksLikeShoppingQuery(t)) return true;
  return t.length >= 3;
}

function isAdvisoryQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  // "what TV should I buy?", "what's a good laptop?", "recommend me headphones", etc.
  return (
    /\bwhat\b.{0,30}\bshould (i|we)\b.{0,20}\b(buy|get|pick|choose|go with)\b/i.test(t) ||
    /\b(recommend|suggest|advise).{0,30}\b(tv|laptop|phone|headphones?|camera|tablet|monitor|mattress|fridge|refrigerator|washer|dryer|blender|vacuum|router|speaker)\b/i.test(t) ||
    /\bwhat('s| is) (a |the )?(best|good|great|right)\b.{0,40}\b(for me|to buy|to get)\b/i.test(t) ||
    /\bhelp me (pick|choose|decide|find the (best|right))\b/i.test(t) ||
    /\b(which|what kind of) .{0,30}\b(should i|would you recommend|is better|is best)\b/i.test(t)
  );
}

function isConversationalOnly(text: string, session?: SessionState): boolean {
  const t = text.trim();
  if (session && shouldMergeWithPreviousSearch(t, session)) return false;
  if (looksLikeShoppingQuery(t)) return false;
  if (GREETING.test(t)) return true;
  if (/^thanks|thank you|thx$/i.test(t)) return true;
  if (/^help$|how (does|do) (this|homivion|shop scout) work/i.test(t)) return true;
  if (isMetaQuestion(t)) return true;
  if (isFollowUpAboutResults(t)) return true;
  if (isAdvisoryQuestion(t)) return true;
  if (t.length < 12 && !/\d/.test(t)) return true;
  return false;
}

export interface ResolvedChatTurn {
  action: ChatAction;
  session: SessionState;
  productResults?: ProductSearchResults;
  /** Structured retrieval for LLM — never raw HTML or scrapes. */
  retrievalPayload?: CommerceRetrievalPayload;
  commerceInsight?: IntelligenceInsight;
  compareMode: boolean;
  chips?: string[];
  zipCode: string;
  query?: string;
  nearStores?: string[];
  referenceProductTitle?: string;
  clarifyQuestion?: string;
  conversationDebug?: ConversationDebugSnapshot;
}

async function searchWithIntelligenceFirst(
  fullIntent: ShoppingIntent,
  zip: string,
  userId?: string,
  progressive = true,
): Promise<{
  productResults: ProductSearchResults;
  retrievalPayload?: CommerceRetrievalPayload;
  commerceInsight?: IntelligenceInsight;
}> {
  const intel = tryIntelligenceSearch(fullIntent, zip);
  if (intel) {
    return {
      productResults: intel.productResults,
      retrievalPayload: intel.retrievalPayload,
      commerceInsight: intel.commerceInsight,
    };
  }
  const productResults = await searchService.search(fullIntent, {
    userId,
    fastOnly: progressive,
  });
  return { productResults };
}

function withConversationDebug(
  result: ResolvedChatTurn,
  input: {
    message: string;
    priorSession: SessionState;
    merged: boolean;
  },
): ResolvedChatTurn {
  if (!conversationDebugEnabled()) return result;
  const priorQuery = input.priorSession.intent?.query ?? "";
  const transition = priorQuery
    ? classifyIntentTransition(priorQuery, input.message, input.priorSession)
    : undefined;
  return {
    ...result,
    conversationDebug: buildConversationDebugSnapshot({
      action: result.action,
      message: input.message,
      priorSession: input.priorSession,
      nextSession: result.session,
      merged: input.merged,
      transition,
    }),
  };
}

export async function resolveChatTurn(
  message: string,
  session: SessionState,
  zipCode?: string,
  learningProfile?: LearningProfile,
  userId?: string,
  history?: ChatHistoryMessage[],
  progressive = true,
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
      chips: [...GROCERY_DEMO_CHIPS.slice(0, 3), "Paste an Amazon link"],
    };
  }

  if (!isValidZip(zip)) {
    zip = "";
  }

  const url = extractUrl(text);
  if (url) {
    const parsed = parseProductUrl(url);
    if (!parsed) {
      await recordAnalyticsEvent({
        name: "link_ingest_failed",
        properties: { sourceUrl: url, reason: "parse_failed" },
      }, userId);
      return {
        action: "invalid_link",
        session: { phase: "idle", intent: { zipCode: zip }, asked: [] },
        compareMode: false,
        zipCode: zip,
      };
    }

    sourceUrl = url;
    const fullIntent = enrichIntent(
      {
        query: parsed.guessedTitle,
        zipCode: zip,
        ...(parsed.category ? { category: parsed.category } : {}),
      },
      learningProfile,
    );

    const ingest = await ingestLinkProduct(url);
    if (!ingest) {
      await recordAnalyticsEvent({
        name: "link_ingest_failed",
        properties: { sourceUrl: url, reason: "ingest_failed" },
      }, userId);
      return {
        action: "invalid_link",
        session: { phase: "idle", intent: { zipCode: zip }, asked: [] },
        compareMode: false,
        zipCode: zip,
      };
    }

    sourceProductTitle = ingest.guessedTitle;
    intent = {
      query: ingest.guessedTitle,
      zipCode: zip,
      ...(ingest.category ? { category: ingest.category } : {}),
    };

    await recordAnalyticsEvent({
      name: "link_pasted",
      properties: {
        sourceUrl: url,
        sourceRetailer: ingest.sourceRetailer,
        matchTier: ingest.matchTier,
        matchConfidence: ingest.matchConfidence,
        pdpFetchOk: ingest.pdpFetchOk,
        useExactCompare: ingest.useExactCompare,
        ingestLatencyMs: ingest.ingestLatencyMs,
      },
    }, userId);

    if (ingest.matchTier === "exact") {
      await recordAnalyticsEvent({ name: "link_canonical_exact", properties: { catalogId: ingest.catalogId } }, userId);
    } else if (ingest.matchTier === "near") {
      await recordAnalyticsEvent({ name: "link_canonical_near", properties: { catalogId: ingest.catalogId } }, userId);
    } else if (ingest.matchTier === "none") {
      await recordAnalyticsEvent({ name: "link_canonical_failed", properties: { title: ingest.guessedTitle } }, userId);
    }
    if (ingest.matchConfidence < 0.6 || ingest.variantWarning) {
      await recordAnalyticsEvent({
        name: "link_low_confidence",
        properties: { matchConfidence: ingest.matchConfidence, variantWarning: ingest.variantWarning },
      }, userId);
    }
    if (ingest.unsupportedRetailer) {
      await recordAnalyticsEvent({ name: "link_unsupported_retailer", properties: { hostname: ingest.hostname } }, userId);
    }

    const productResults = await searchService.searchFromLink(
      {
        guessedTitle: ingest.guessedTitle,
        category: ingest.category,
        referencePrice: ingest.referencePrice,
        sourceUrl: url,
        sourceRetailer: ingest.sourceRetailer,
        catalogId: ingest.catalogId,
      },
      fullIntent,
      { userId, linkIngest: ingest },
    );

    return {
      action: "link_search",
      session: {
        phase: "ready",
        intent,
        asked: ["url"],
        sourceUrl,
        sourceProductTitle,
        compareMode: ingest.useExactCompare,
      },
      productResults,
      compareMode: ingest.useExactCompare,
      zipCode: zip,
      query: ingest.guessedTitle,
      referenceProductTitle: ingest.guessedTitle,
    };
  }

  const fullIntentFromSession = () =>
    enrichIntent({ ...intent, zipCode: zip }, learningProfile);

  if (
    phase === "ready" &&
    (isRecheckMessage(text) || /cheaper|again|refresh/i.test(text))
  ) {
    const fullIntent = fullIntentFromSession();
    let productResults: ProductSearchResults;
    let retrievalPayload: CommerceRetrievalPayload | undefined;
    let commerceInsight: IntelligenceInsight | undefined;
    if (sourceUrl) {
      productResults = await searchService.searchFromLink(
        {
          guessedTitle: sourceProductTitle ?? fullIntent.query,
          category: fullIntent.category,
          referencePrice: fullIntent.maxPrice ?? 49.99,
          sourceUrl,
        },
        fullIntent,
        { userId },
      );
    } else {
      const intel = await searchWithIntelligenceFirst(fullIntent, zip, userId, progressive);
      productResults = intel.productResults;
      retrievalPayload = intel.retrievalPayload;
      commerceInsight = intel.commerceInsight;
    }

    return {
      action: "recheck",
      session,
      productResults,
      retrievalPayload,
      commerceInsight,
      compareMode: false,
      zipCode: zip,
      query: fullIntent.query,
      referenceProductTitle: sourceProductTitle,
      chips: ["Recheck prices", "Whole milk", "Paste an Amazon link"],
    };
  }

  if (phase === "ready" && shouldMergeWithPreviousSearch(text, session)) {
    const priorSession = session;
    intent = mergeSearchIntent(session.intent, text);
    const fullIntent = enrichIntent({ ...intent, zipCode: zip }, learningProfile);
    const { productResults, retrievalPayload, commerceInsight } =
      await searchWithIntelligenceFirst(fullIntent, zip, userId, progressive);

    return withConversationDebug(
      {
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
        retrievalPayload,
        commerceInsight,
        compareMode: false,
        zipCode: zip,
        query: fullIntent.query,
        chips: getDynamicOnboardingChips(fullIntent.query, 5),
      },
      { message: text, priorSession, merged: true },
    );
  }

  if (phase === "ready" && isFollowUpAboutResults(text)) {
    const fullIntent = fullIntentFromSession();
    const { productResults, retrievalPayload, commerceInsight } =
      await searchWithIntelligenceFirst(fullIntent, zip, userId, progressive);
    return {
      action: "conversational",
      session,
      productResults,
      retrievalPayload,
      commerceInsight,
      compareMode: false,
      zipCode: zip,
      query: fullIntent.query,
    };
  }

  if (isConversationalOnly(text, session) && !isProductSearchMessage(text)) {
    const fullIntent =
      phase === "ready" && intent.query ? fullIntentFromSession() : undefined;
    let productResults: ProductSearchResults | undefined;
    let retrievalPayload: CommerceRetrievalPayload | undefined;
    let commerceInsight: IntelligenceInsight | undefined;
    if (fullIntent && isFollowUpAboutResults(text)) {
      const intel = await searchWithIntelligenceFirst(fullIntent, zip, userId, progressive);
      productResults = intel.productResults;
      retrievalPayload = intel.retrievalPayload;
      commerceInsight = intel.commerceInsight;
    }

    return {
      action: "conversational",
      session: { phase: phase === "ready" ? "ready" : "idle", intent: { zipCode: zip, ...intent }, asked, sourceUrl, sourceProductTitle, compareMode: false },
      productResults,
      retrievalPayload,
      commerceInsight,
      compareMode: false,
      zipCode: zip,
      query: intent.query,
      chips: zip
        ? [...GROCERY_DEMO_CHIPS.slice(0, 2), "Recheck prices", "Paste an Amazon link"]
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
      const { productResults, retrievalPayload, commerceInsight } =
        await searchWithIntelligenceFirst(fullIntent, zip, userId, progressive);
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
        retrievalPayload,
        commerceInsight,
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
      const { productResults, retrievalPayload, commerceInsight } =
        await searchWithIntelligenceFirst(fullIntent, zip, userId, progressive);
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
        retrievalPayload,
        commerceInsight,
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
    const merging = shouldMergeWithPreviousSearch(text, session);
    const priorSession = session;
    if (merging) {
      intent = mergeSearchIntent(session.intent, text);
    } else if (phase !== "ready" || !compareMode) {
      intent = { ...buildIntentFromQuery(text), zipCode: zip };
      if (phase === "ready" && session.intent?.query?.trim()) {
        sourceUrl = undefined;
        sourceProductTitle = undefined;
      }
    } else {
      intent = { ...intent, ...buildIntentFromQuery(text), zipCode: zip };
    }

    const skipClarifyForRefine =
      session.phase === "ready" &&
      Boolean(session.intent?.query?.trim()) &&
      merging;

    const analysis = skipClarifyForRefine
      ? { intent: {}, needsClarification: false as const }
      : await analyzeShoppingMessage(
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
    const { productResults, retrievalPayload, commerceInsight } =
      await searchWithIntelligenceFirst(fullIntent, zip, userId, progressive);

    return withConversationDebug(
      {
        action: "search",
        session: {
          phase: "ready",
          intent: fullIntent,
          asked,
          sourceUrl: merging ? sourceUrl : undefined,
          sourceProductTitle: merging ? sourceProductTitle : undefined,
          compareMode: false,
        },
        productResults,
        retrievalPayload,
        commerceInsight,
        compareMode: false,
        zipCode: zip,
        query: fullIntent.query,
        chips: getDynamicOnboardingChips(fullIntent.query),
      },
      { message: text, priorSession, merged: merging },
    );
  }

  return {
    action: "conversational",
    session: { phase: "idle", intent: { zipCode: zip }, asked: [] },
    compareMode: false,
    zipCode: zip,
    chips: [...DEFAULT_CHAT_CHIPS],
  };
}
