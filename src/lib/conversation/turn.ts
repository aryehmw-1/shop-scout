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
  const t = text.trim();
  // Only a SHORT, bare phrase refers to the current results ("which is cheaper?",
  // "best price?", "what do you recommend"). A longer noun phrase that merely
  // contains one of these words is a NEW product search — e.g. "Honey Nut
  // Cheerios best price" must search, not be answered as a follow-up.
  if (t.split(/\s+/).length > 4) return false;
  return /which (one|store|deal)|cheaper|better deal|best (deal|price|option)|compare these|what do you recommend|worth it|should i buy/i.test(
    t,
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

/**
 * Detects general / non-shopping questions — personal ("how old am I?"),
 * world-knowledge ("what's the capital of France?"), chit-chat ("how are
 * you?"), or any question that carries no shopping or price intent. These must
 * be answered conversationally, never run as a 0-result product search.
 *
 * A real product query is almost always a noun phrase ("whole milk gallon",
 * "Beats Studio Pro"), not a question — so a question with no shopping signal
 * is treated as general. Anything mentioning price/buy/store/etc. or a known
 * shopping category is explicitly excluded so genuine product questions
 * ("where can I buy cheap milk?") still search.
 */
function isGeneralKnowledgeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  const isQuestion =
    /\?\s*$/.test(t) ||
    /^(who|what|whats|what's|why|when|where|how|is|are|am|do|does|can|could|would|should|will|did|have|has)\b/.test(t);
  if (!isQuestion) return false;
  // Shopping / price / availability intent → this IS a product question.
  if (
    /\b(price|prices|pricing|cost|costs|cheap|cheaper|cheapest|buy|sell|sells|selling|carry|stock|in stock|deal|deals|compare|comparison|find me|where (can|to|do)|ship|shipping|order|store|stores|retailer|brand|under \$?\d|less than \$?\d|on sale)\b/.test(
      t,
    )
  ) {
    return false;
  }
  if (looksLikeShoppingQuery(t)) {
    // Still let obvious personal/world-knowledge questions through even though
    // they're 2+ words (looksLikeShoppingQuery counts any 2+ words as shopping).
    if (
      !/\b(old am i|my age|my name|name is|time is it|day is it|what day|date today|weather|who (are|won|is|was)|tell me a joke|joke|meaning of|capital of|how are you|what'?s up|how's it going|favorite|your name|do you (know|like|think|feel)|are you (ok|real|human|sentient)|2\s*[+x*]\s*2|\d+\s*[+\-x*/]\s*\d+)\b/.test(
        t,
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Conservative keyboard-mash / gibberish detector for a SINGLE-token query
 * (e.g. "hjj", "asdfgh", "zzzz"). The goal is to avoid surfacing the "request
 * this product" form for obvious nonsense, WITHOUT blocking real short queries.
 * Product names get weird, so we only flag the clear cases and keep an allowlist
 * of legitimate consonant-only terms (tv, ps5, ssd, gpu, oled, …).
 */
const NON_GIBBERISH_CONSONANT_TERMS = new Set([
  "tv", "pc", "ps", "psp", "ps5", "ps4", "vr", "dvd", "hd", "ssd", "hdd", "gpu",
  "cpu", "usb", "hdmi", "rgb", "led", "lcd", "oled", "qled", "dslr", "sd", "xl",
  "xs", "xxl", "lg", "hp", "tws", "anc", "rtx", "gtx", "nvme", "mtg",
]);
function looksLikeGibberish(text: string): boolean {
  const t = text.trim().toLowerCase();
  // Only judge single tokens — multi-word queries are almost never mash.
  if (/\s/.test(t)) return false;
  // Anything with a digit reads as a model number (ps5, rtx4090, a51) — keep it.
  if (/\d/.test(t)) return false;
  if (!/^[a-z]+$/.test(t)) return false;
  if (NON_GIBBERISH_CONSONANT_TERMS.has(t)) return false;
  // The same letter typed 3+ times in a row ("zzzz", "aaa", "hjjj").
  if (/(.)\1\1/.test(t)) return true;
  // No vowels at all in a 3+ letter alphabetic token ("hjj", "zxcv", "qwrt").
  if (t.length >= 3 && !/[aeiou]/.test(t)) return true;
  return false;
}

function isProductSearchMessage(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || isValidZip(t) || GREETING.test(t)) return false;
  if (looksLikeGibberish(t)) return false;
  if (extractUrl(t)) return false;
  if (isRecheckMessage(t) || isFollowUpAboutResults(t)) return false;
  if (/^(help|how does this work|\?)$/i.test(t)) return false;
  if (isMetaQuestion(t)) return false;
  if (isGeneralKnowledgeQuestion(t)) return false;
  // Advice / "which should I buy" / "X or Y" / "X vs Y" questions are answered
  // conversationally — they must NOT run a 0-result catalog search (which would
  // wrongly surface the "request this product" form).
  if (isAdviceOrComparisonQuestion(t)) return false;
  if (looksLikeShoppingQuery(t)) return true;
  return t.length >= 3;
}

/**
 * True for questions that ask for a recommendation or a head-to-head comparison
 * rather than a price lookup — e.g. "should I buy the Apple Watch 11 or SE?",
 * "which is better, X or Y?", "AirPods vs AirPods Pro", "is the X worth it?".
 * These deserve a real answer (from the assistant's knowledge / web search),
 * not a catalog search. Explicit price/compare-price intent is excluded so
 * genuine shopping queries still search.
 */
function isAdviceOrComparisonQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (
    /\b(cheapest|lowest price|best price|price check|compare prices|where (can|to) (i )?buy|find me|add to cart|on sale)\b/.test(
      t,
    )
  ) {
    return false;
  }
  if (isAdvisoryQuestion(t) || isOpinionAdviceQuestion(t)) return true;
  if (/\b\w+\s+vs\.?\s+\w+/.test(t)) return true;
  if (/\bwhich (is|one|are|would|should)\b.{0,40}\b(better|best|worth|right|recommend)/.test(t)) {
    return true;
  }
  if (/\b(better|best)\b.{0,20}\b(option|choice|to (buy|get|pick))\b/.test(t)) return true;
  // "X or Y?" style choices that read as a question asking us to pick.
  if (/\bor\b/.test(t) && /\?\s*$/.test(t) && /\b(should|which|better|buy|get|worth)\b/.test(t)) {
    return true;
  }
  return false;
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

/**
 * Opinion / fit / sizing questions — "should I get medium or large?",
 * "do you think this is worth it?", "is this too big?". These ask for the
 * assistant's judgment, NOT a price comparison, even when a product link is
 * pasted alongside. We must NOT treat these as a 0-result inventory search.
 */
function isOpinionAdviceQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  // If they're clearly asking us to find/compare prices, this is a search.
  if (/\b(compare|cheaper|cheapest|lowest price|best price|where (can|to) (i )?buy|find me|better deal|price check)\b/.test(t)) {
    return false;
  }
  return (
    /\bdo you think\b/.test(t) ||
    /\bshould i\b.{0,40}\b(get|buy|order|pick|choose|go|size|keep|return)\b/.test(t) ||
    /\b(same|smaller|bigger|larger|a smaller|a bigger) (size|one)\b/.test(t) ||
    /\bsize (up|down)\b/.test(t) ||
    /\btoo (big|small|large|tight|loose|short|long)\b/.test(t) ||
    /\bwhat size\b/.test(t) ||
    /\bwhich (size|one|colou?r) (should|would|do)\b/.test(t) ||
    /\bis (it|this) worth it\b/.test(t) ||
    /\bwould you (recommend|get|buy|keep|return)\b/.test(t)
  );
}

/**
 * Long, multi-sentence prose / instructions (e.g. a pasted paragraph of design
 * requirements with bullet lists). These are never a product query — a real
 * search is short — so they must not hit the inventory-miss search path.
 */
function isLongInstructionProse(text: string): boolean {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  const lineBullets = t.match(/(^|\n)\s*([*•\-]|\d+\.)\s+\S/g)?.length ?? 0;
  const inlineBullets = t.match(/(?:^|\s)([*•])\s+\S/g)?.length ?? 0;
  const bulletCount = Math.max(lineBullets, inlineBullets);
  if (words > 45 || t.length > 320) return true;
  if (bulletCount >= 2 && words > 20) return true;
  return false;
}

/**
 * In an advice conversation, the user explicitly asking us to look up / compare
 * prices (or affirming an offer to do so) means we should LEAVE advice mode and
 * run a real search. Everything else (their preferences, "just works", budget,
 * features, etc.) stays in the advice thread.
 */
function wantsPriceLookupNow(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (
    /\b(compare|cheapest|lowest price|best price|price check|check (the )?prices?|see (the )?prices?|where (can|to) (i )?buy|find me|how much|on sale|add to cart|buy it|search for)\b/.test(
      t,
    )
  ) {
    return true;
  }
  // "yes/sure/ok, (compare|check|do it)" affirmatives to "want me to check prices?"
  if (/^(yes|yep|yeah|sure|ok(ay)?|please|go ahead|do it|sounds good)\b/.test(t) &&
      /\b(price|prices|compare|check|do it|please)\b/.test(t)) {
    return true;
  }
  return false;
}

function isConversationalOnly(text: string, session?: SessionState): boolean {
  const t = text.trim();
  if (session && shouldMergeWithPreviousSearch(t, session)) return false;
  if (isGeneralKnowledgeQuestion(t)) return true;
  // Advice / comparison questions are conversational even though they mention
  // product names (which would otherwise look like a shopping query).
  if (isAdviceOrComparisonQuestion(t)) return true;
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
  /** Advice / comparison turn — answer from knowledge / web search, no catalog form. */
  adviceMode?: boolean;
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

  // Long instruction-style prose (pasted requirements, multi-bullet paragraphs)
  // is never a product query — answer conversationally instead of searching.
  if (isLongInstructionProse(text)) {
    return withConversationDebug(
      {
        action: "conversational",
        session: {
          phase: phase === "ready" ? "ready" : "idle",
          intent: { ...intent, zipCode: zip },
          asked,
          sourceUrl,
          sourceProductTitle,
          compareMode: false,
        },
        compareMode: false,
        zipCode: zip,
        query: intent.query,
        chips: [...DEFAULT_CHAT_CHIPS],
      },
      { message: text, priorSession: session, merged: false },
    );
  }

  // Continuation of an ongoing advice conversation. After we give buying advice
  // (and often ask "what matters most — budget, features, use?"), the user's
  // reply is an ANSWER to that thread — even though it may mention a product
  // word like "watch". Keep it in advice mode so we give a recommendation,
  // instead of treating it as a fresh catalog search and surfacing the
  // "couldn't find … in our catalog" request form. They leave advice mode only
  // by explicitly asking us to look up / compare prices.
  if (
    session.advicePending &&
    !extractUrl(text) &&
    !isValidZip(text) &&
    !wantsPriceLookupNow(text)
  ) {
    return withConversationDebug(
      {
        action: "conversational",
        session: {
          phase: phase === "ready" ? "ready" : "idle",
          intent: { ...intent, zipCode: zip },
          asked,
          sourceUrl,
          sourceProductTitle,
          compareMode: false,
          advicePending: true,
        },
        compareMode: false,
        adviceMode: true,
        zipCode: zip,
        query: intent.query,
        chips: ["Compare prices", "Search something else", "Paste an Amazon link"],
      },
      { message: text, priorSession: session, merged: false },
    );
  }

  // Opinion / fit / sizing questions are answered conversationally — even when
  // a product link is pasted alongside — instead of running a 0-result search.
  if (isOpinionAdviceQuestion(text)) {
    const linkedTitle = extractUrl(text) ? sourceProductTitle : undefined;
    return withConversationDebug(
      {
        action: "conversational",
        session: {
          phase: phase === "ready" ? "ready" : "idle",
          intent: { ...intent, zipCode: zip },
          asked,
          sourceUrl,
          sourceProductTitle,
          compareMode: false,
          advicePending: true,
        },
        compareMode: false,
        adviceMode: true,
        zipCode: zip,
        query: intent.query,
        referenceProductTitle: linkedTitle,
        chips: ["Compare prices", "Search something else", "Paste an Amazon link"],
      },
      { message: text, priorSession: session, merged: false },
    );
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

    const adviceMode = !productResults && isAdviceOrComparisonQuestion(text);
    return {
      action: "conversational",
      session: {
        phase: phase === "ready" ? "ready" : "idle",
        intent: { ...intent, zipCode: zip },
        asked,
        sourceUrl,
        sourceProductTitle,
        compareMode: false,
        // Keep the advice thread alive so the user's follow-up answer isn't
        // mistaken for a new catalog search.
        ...(adviceMode ? { advicePending: true } : {}),
      },
      productResults,
      retrievalPayload,
      commerceInsight,
      compareMode: false,
      adviceMode,
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
    !looksLikeGibberish(text) &&
    (isProductSearchMessage(text) || (phase === "ready" && !GREETING.test(text)));

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
